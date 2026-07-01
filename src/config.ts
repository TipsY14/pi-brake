import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_KEY = "contextBrake";

export interface ContextBrakeConfig {
  enabled: boolean;
  softThresholdPercent: number;
  hardThresholdPercent: number;
  debug: boolean;
}

export const DEFAULT_CONFIG: ContextBrakeConfig = {
  enabled: true,
  softThresholdPercent: 88,
  hardThresholdPercent: 96,
  debug: false,
};

type JsonObject = Record<string, unknown>;

export interface ConfigSourceDiagnostics {
  path: string;
  exists: boolean;
  raw: JsonObject;
  error?: string;
}

export interface ContextBrakeConfigDiagnostics {
  global: ConfigSourceDiagnostics;
  project: ConfigSourceDiagnostics;
  mergedRaw: JsonObject;
  config: ContextBrakeConfig;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function warningMessage(filePath: string, error: unknown): string {
  return `[context-brake] Ignoring unreadable settings file ${filePath}: ${
    error instanceof Error ? error.message : String(error)
  }`;
}

function readConfigSource(filePath: string): ConfigSourceDiagnostics {
  const exists = existsSync(filePath);
  if (!exists) {
    return { path: filePath, exists, raw: {} };
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    if (!isObject(parsed)) {
      return { path: filePath, exists, raw: {}, error: "settings root is not an object" };
    }

    const raw = parsed[CONFIG_KEY];
    if (raw === undefined) {
      return { path: filePath, exists, raw: {} };
    }

    if (!isObject(raw)) {
      return { path: filePath, exists, raw: {}, error: `${CONFIG_KEY} is not an object` };
    }

    return { path: filePath, exists, raw };
  } catch (error) {
    const message = warningMessage(filePath, error);
    console.warn(message);
    return { path: filePath, exists, raw: {}, error: message };
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
  const debug = typeof raw.debug === "boolean" ? raw.debug : DEFAULT_CONFIG.debug;
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

  return { enabled, softThresholdPercent, hardThresholdPercent, debug };
}

export function getPiAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

export function loadConfigDiagnostics(cwd: string): ContextBrakeConfigDiagnostics {
  const globalPath = join(getPiAgentDir(), "settings.json");
  const projectPath = join(cwd, ".pi", "settings.json");
  const global = readConfigSource(globalPath);
  const project = readConfigSource(projectPath);
  const mergedRaw = {
    ...global.raw,
    ...project.raw,
  };

  return {
    global,
    project,
    mergedRaw,
    config: normalizeConfig(mergedRaw),
  };
}

export function loadConfig(cwd: string): ContextBrakeConfig {
  return loadConfigDiagnostics(cwd).config;
}

export function exampleGlobalSettingsPath(): string {
  return join(homedir(), ".pi", "agent", "settings.json");
}
