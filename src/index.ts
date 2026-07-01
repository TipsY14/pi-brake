import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { loadConfig } from "./config.ts";
import { appendBrakeToProviderPayloadWithMetadata } from "./payload.ts";
import { brakePrompt } from "./prompts.ts";
import {
  CUSTOM_MESSAGE_TYPE,
  chooseBrakeLevel,
  createBrakeRuntimeState,
  usagePercent,
  type AgentMessageLike,
  type ContextUsageLike,
} from "./state.ts";

const STATUS_KEY = "context-brake";

function withoutPreviousBrakeMessages(messages: AgentMessageLike[]): AgentMessageLike[] {
  return messages.filter((message) => {
    return !(message.role === "custom" && message.customType === CUSTOM_MESSAGE_TYPE);
  });
}

function clearStatus(ctx: ExtensionContext): void {
  if (ctx.hasUI) {
    ctx.ui.setStatus(STATUS_KEY, undefined);
  }
}

function formatBrakeActiveText(level: "soft" | "hard", percent: number): string {
  return `context-brake: ${level} brake active at ${Math.round(percent)}%`;
}

function notifyBrakeInjected(ctx: ExtensionContext, enabled: boolean, level: "soft" | "hard", percent: number): void {
  if (!enabled || !ctx.hasUI) {
    return;
  }

  const text = formatBrakeActiveText(level, percent);
  ctx.ui.setStatus(STATUS_KEY, text);
  ctx.ui.notify(text, level === "hard" ? "warning" : "info");
}

export default function contextBrakeExtension(pi: ExtensionAPI) {
  const state = createBrakeRuntimeState();

  const clearPending = () => {
    state.pending = null;
  };

  const beginFreshAgentScope = (ctx?: ExtensionContext) => {
    state.turnId += 1;
    clearPending();
    if (ctx) {
      clearStatus(ctx);
    }
  };

  pi.on("session_start", () => {
    beginFreshAgentScope();
  });

  pi.on("session_shutdown", (_event, ctx) => {
    beginFreshAgentScope(ctx);
  });

  pi.on("agent_start", (_event, ctx) => {
    beginFreshAgentScope(ctx);
  });

  pi.on("turn_start", () => {
    // Defensive cleanup: a pending decision must never survive into a later
    // provider request if an earlier request was cancelled before
    // before_provider_request ran.
    beginFreshAgentScope();
  });

  pi.on("context", (event, ctx) => {
    const messages = withoutPreviousBrakeMessages(event.messages as AgentMessageLike[]);
    const config = loadConfig(ctx.cwd);
    const usage = ctx.getContextUsage() as ContextUsageLike | undefined;
    const percent = usagePercent(usage, messages);
    const level = chooseBrakeLevel(percent, config);

    if (!config.enabled) {
      clearPending();
      clearStatus(ctx);
      return messages.length === event.messages.length ? undefined : { messages: messages as never };
    }

    if (!level || percent === null) {
      clearPending();
      clearStatus(ctx);
      return messages.length === event.messages.length ? undefined : { messages: messages as never };
    }

    state.pending = {
      level,
      percent,
      prompt: brakePrompt(level),
      turnId: state.turnId,
    };

    // Do not return a brake message here. The context event is only the
    // pressure monitor; final injection happens at before_provider_request so
    // the instruction is never appended to Agent state or session history.
    return messages.length === event.messages.length ? undefined : { messages: messages as never };
  });

  pi.on("before_provider_request", (event, ctx) => {
    const decision = state.pending;
    if (!decision || decision.turnId !== state.turnId) {
      clearPending();
      return;
    }

    // One-shot final injection point: modify only this serialized provider
    // request, then clear in-memory state immediately. If the provider payload
    // shape is unfamiliar, the helper returns it unchanged rather than risking
    // corruption; the pending flag is still consumed so there is no leak.
    clearPending();
    const result = appendBrakeToProviderPayloadWithMetadata(event.payload, decision.prompt);

    const config = loadConfig(ctx.cwd);
    if (result.metadata.mutated) {
      notifyBrakeInjected(ctx, config.notify, decision.level, decision.percent);
    }

    return result.payload;
  });

  pi.on("agent_end", (_event, ctx) => {
    clearPending();
    clearStatus(ctx);
  });
}
