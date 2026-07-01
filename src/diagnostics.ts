import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { ContextBrakeConfigDiagnostics } from "./config.ts";
import type { BrakeRuntimeState, ContextUsageLike, LastDecisionDetails, LastInjectionDetails } from "./state.ts";

function formatValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "unknown";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : String(value);
  }
  if (typeof value === "boolean" || typeof value === "string") {
    return String(value);
  }
  return JSON.stringify(value);
}

function formatPercent(percent: number | null | undefined): string {
  if (percent === null) {
    return "null";
  }
  if (percent === undefined) {
    return "unknown";
  }
  if (!Number.isFinite(percent)) {
    return String(percent);
  }
  return `${Math.round(percent * 100) / 100}%`;
}

function formatTimestamp(timestamp: number | null | undefined): string {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return "never";
  }
  return `${new Date(timestamp).toISOString()} (${timestamp})`;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/\n/g, "\n  ");
}

function usageLines(usage: ContextUsageLike | undefined): string[] {
  if (!usage) {
    return ["- ctx.getContextUsage(): unknown"];
  }

  return [
    "- ctx.getContextUsage():",
    `  - tokens: ${formatValue(usage.tokens)}`,
    `  - contextWindow: ${formatValue(usage.contextWindow)}`,
    `  - percent: ${formatPercent(usage.percent)}`,
  ];
}

function modelLines(model: ExtensionContext["model"]): string[] {
  if (!model) {
    return ["- model: unknown"];
  }

  return [
    "- model:",
    `  - provider: ${model.provider}`,
    `  - id: ${model.id}`,
    `  - name: ${model.name}`,
    `  - api: ${model.api}`,
    `  - contextWindow: ${formatValue(model.contextWindow)}`,
    `  - maxTokens: ${formatValue(model.maxTokens)}`,
  ];
}

function pendingLines(state: BrakeRuntimeState): string[] {
  if (!state.pending) {
    return ["- pending: none"];
  }

  return [
    "- pending:",
    `  - level: ${state.pending.level}`,
    `  - percent: ${formatPercent(state.pending.percent)}`,
    `  - turnId: ${state.pending.turnId}`,
  ];
}

function decisionLines(decision: LastDecisionDetails | null): string[] {
  if (!decision) {
    return ["- last decision: none"];
  }

  return [
    "- last decision:",
    `  - level: ${decision.level ?? "none"}`,
    `  - percent: ${formatPercent(decision.percent)}`,
    `  - tokens: ${formatValue(decision.tokens)}`,
    `  - contextWindow: ${formatValue(decision.contextWindow)}`,
    `  - timestamp: ${formatTimestamp(decision.timestamp)}`,
    `  - turnId: ${decision.turnId}`,
    `  - reason: ${decision.reason}`,
  ];
}

function injectionLines(injection: LastInjectionDetails | null): string[] {
  if (!injection) {
    return ["- last injection: none"];
  }

  return [
    "- last injection:",
    `  - level: ${injection.level}`,
    `  - percent: ${formatPercent(injection.percent)}`,
    `  - timestamp: ${formatTimestamp(injection.timestamp)}`,
    `  - turnId: ${injection.turnId}`,
    `  - payload shape: ${injection.payload.shape}`,
    `  - payload mutated: ${injection.payload.mutated}`,
    `  - mutation: ${injection.payload.mutation}`,
    `  - promptChars: ${injection.payload.promptChars}`,
  ];
}

function sourceLines(label: string, source: ContextBrakeConfigDiagnostics["global"]): string[] {
  return [
    `- ${label}:`,
    `  - path: ${source.path}`,
    `  - exists: ${source.exists}`,
    `  - raw contextBrake: ${formatJson(source.raw)}`,
    ...(source.error ? [`  - error: ${source.error}`] : []),
  ];
}

export interface ContextBrakeDiagnosticsInput {
  cwd: string;
  configDiagnostics: ContextBrakeConfigDiagnostics;
  usage: ContextUsageLike | undefined;
  model: ExtensionContext["model"];
  state: BrakeRuntimeState;
}

export function formatContextBrakeDiagnostics(input: ContextBrakeDiagnosticsInput): string {
  const lines = [
    "pi-context-brake diagnostics",
    "",
    "Config",
    `- cwd: ${input.cwd}`,
    ...sourceLines("global", input.configDiagnostics.global),
    ...sourceLines("project", input.configDiagnostics.project),
    `- merged raw contextBrake: ${formatJson(input.configDiagnostics.mergedRaw)}`,
    `- normalized: ${formatJson(input.configDiagnostics.config)}`,
    "",
    "Runtime",
    ...usageLines(input.usage),
    ...modelLines(input.model),
    ...pendingLines(input.state),
    ...decisionLines(input.state.lastDecision),
    ...injectionLines(input.state.lastInjection),
  ];

  return lines.join("\n");
}
