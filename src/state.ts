import type { ContextBrakeConfig } from "./config.ts";
import type { ProviderPayloadAppendMetadata } from "./payload.ts";
import type { BrakeLevel } from "./prompts.ts";

export interface ContextUsageLike {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
}

export const CUSTOM_MESSAGE_TYPE = "context-brake";

export interface BrakeDecision {
  level: BrakeLevel;
  percent: number;
  prompt: string;
  turnId: number;
}

export interface LastDecisionDetails {
  level: BrakeLevel | null;
  percent: number | null;
  tokens: number | null;
  contextWindow: number | null;
  timestamp: number;
  reason: string;
  turnId: number;
}

export interface LastInjectionDetails {
  level: BrakeLevel;
  percent: number;
  timestamp: number;
  turnId: number;
  payload: ProviderPayloadAppendMetadata;
}

export interface AgentMessageLike {
  role?: unknown;
  customType?: unknown;
  content?: unknown;
  command?: unknown;
  output?: unknown;
  summary?: unknown;
}

export interface BrakeRuntimeState {
  pending: BrakeDecision | null;
  lastDecision: LastDecisionDetails | null;
  lastInjection: LastInjectionDetails | null;
  turnId: number;
}

export function createBrakeRuntimeState(): BrakeRuntimeState {
  return {
    pending: null,
    lastDecision: null,
    lastInjection: null,
    turnId: 0,
  };
}

function textLengthFromContent(content: unknown): number {
  if (typeof content === "string") {
    return content.length;
  }

  if (!Array.isArray(content)) {
    return 0;
  }

  return content.reduce((total, block) => {
    if (!block || typeof block !== "object") {
      return total;
    }
    const typedBlock = block as Record<string, unknown>;
    if (typedBlock.type === "text" && typeof typedBlock.text === "string") {
      return total + typedBlock.text.length;
    }
    if (typedBlock.type === "thinking" && typeof typedBlock.thinking === "string") {
      return total + typedBlock.thinking.length;
    }
    if (typedBlock.type === "toolCall") {
      const nameLength = typeof typedBlock.name === "string" ? typedBlock.name.length : 0;
      return total + nameLength + JSON.stringify(typedBlock.arguments ?? {}).length;
    }
    if (typedBlock.type === "image") {
      return total + 4800;
    }
    return total;
  }, 0);
}

function estimateMessageTokens(message: AgentMessageLike): number {
  const role = message.role;
  if (role === "bashExecution") {
    const command = typeof message.command === "string" ? message.command : "";
    const output = typeof message.output === "string" ? message.output : "";
    return Math.ceil((command.length + output.length) / 4);
  }
  if (role === "branchSummary" || role === "compactionSummary") {
    return Math.ceil((typeof message.summary === "string" ? message.summary.length : 0) / 4);
  }
  return Math.ceil(textLengthFromContent(message.content) / 4);
}

export function usagePercent(usage: ContextUsageLike | undefined, messages: AgentMessageLike[]): number | null {
  if (!usage) {
    return null;
  }

  if (typeof usage.percent === "number" && Number.isFinite(usage.percent)) {
    return usage.percent;
  }

  if (typeof usage.tokens === "number" && Number.isFinite(usage.tokens) && usage.contextWindow > 0) {
    return (usage.tokens / usage.contextWindow) * 100;
  }

  if (usage.contextWindow <= 0 || messages.length === 0) {
    return null;
  }

  const estimatedTokens = messages.reduce((total, message) => total + estimateMessageTokens(message), 0);
  return (estimatedTokens / usage.contextWindow) * 100;
}

export function chooseBrakeLevel(percent: number | null, config: ContextBrakeConfig): BrakeLevel | null {
  if (!config.enabled || percent === null || !Number.isFinite(percent)) {
    return null;
  }

  if (percent >= config.hardThresholdPercent) {
    return "hard";
  }

  if (percent >= config.softThresholdPercent) {
    return "soft";
  }

  return null;
}
