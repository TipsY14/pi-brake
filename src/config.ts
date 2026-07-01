import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_KEY = "contextBrake";

export interface ContextBrakeConfig {
  enabled: boolean;
  softThresholdPercent: number;
  hardThresholdPercent: number;
  notify: boolean;
}

export const DEFAULT_CONFIG: ContextBrakeConfig = {
  enabled: true,
  softThresholdPercent: 90,
  hardThresholdPercent: 98,
  notify: true,
};

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function warningMessage(filePath: string, error: unknown): string {
  return `[context-brake] Ignoring unreadable settings file ${filePath}: ${
    error instanceof Error ? error.message : String(error)
  }`;
}

function readConfigSource(filePath: string): JsonObject {
  if (!existsSync(filePath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    if (!isObject(parsed)) {
      return {};
    }

    const raw = parsed[CONFIG_KEY];
    if (raw === undefined || !isObject(raw)) {
      return {};
    }

    return raw;
  } catch (error) {
    console.warn(warningMessage(filePath, error));
    return {};
  }
}

function normalizeThreshold(value: unknown, fallback: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  const normalized = value > 0 && value <= 1 ? value * 100 : value;
  if (normalized <= 0 || normalized > 100) {
    console.warn(`[context-brake] Ignoring invalid ${CONFIG_KEY}.${label}: ${value}. Expected a percent from 0 to 100.`);
    return fallback;
  }

  return normalized;
}

function normalizeConfig(raw: JsonObject): ContextBrakeConfig {
  const enabled = typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_CONFIG.enabled;
  const notify =
    typeof raw.notify === "boolean"
      ? raw.notify
      : typeof raw.showNotification === "boolean"
        ? raw.showNotification
        : DEFAULT_CONFIG.notify;
  const softThresholdPercent = normalizeThreshold(
    raw.softThresholdPercent,
    DEFAULT_CONFIG.softThresholdPercent,
    "softThresholdPercent",
  );
  const hardThresholdPercent = normalizeThreshold(
    raw.hardThresholdPercent,
    DEFAULT_CONFIG.hardThresholdPercent,
    "hardThresholdPercent",
  );

  if (softThresholdPercent > hardThresholdPercent) {
    console.warn(
      `[context-brake] ${CONFIG_KEY}.softThresholdPercent is above hardThresholdPercent; hard threshold will take precedence when both match.`,
    );
  }

  return { enabled, softThresholdPercent, hardThresholdPercent, notify };
}

export function getPiAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

export function loadConfig(cwd: string): ContextBrakeConfig {
  const globalPath = join(getPiAgentDir(), "settings.json");
  const projectPath = join(cwd, ".pi", "settings.json");
  const mergedRaw = {
    ...readConfigSource(globalPath),
    ...readConfigSource(projectPath),
  };

  return normalizeConfig(mergedRaw);
}

export function exampleGlobalSettingsPath(): string {
  return join(homedir(), ".pi", "agent", "settings.json");
}
