import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_KEY = "contextBrake";

export interface ContextBrakeConfig {
  enabled: boolean;
  softThresholdPercent: number;
  hardThresholdPercent: number;
}

export const DEFAULT_CONFIG: ContextBrakeConfig = {
  enabled: true,
  softThresholdPercent: 88,
  hardThresholdPercent: 96,
};

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonObject(filePath: string): JsonObject {
  if (!existsSync(filePath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    return isObject(parsed) ? parsed : {};
  } catch (error) {
    console.warn(
      `[context-brake] Ignoring unreadable settings file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {};
  }
}

function readRawConfig(filePath: string): JsonObject {
  const settings = readJsonObject(filePath);
  const raw = settings[CONFIG_KEY];
  return isObject(raw) ? raw : {};
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

  return { enabled, softThresholdPercent, hardThresholdPercent };
}

export function getPiAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

export function loadConfig(cwd: string): ContextBrakeConfig {
  const globalPath = join(getPiAgentDir(), "settings.json");
  const projectPath = join(cwd, ".pi", "settings.json");
  const raw = {
    ...readRawConfig(globalPath),
    ...readRawConfig(projectPath),
  };

  return normalizeConfig(raw);
}

export function exampleGlobalSettingsPath(): string {
  return join(homedir(), ".pi", "agent", "settings.json");
}
