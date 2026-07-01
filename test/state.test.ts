import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.ts";
import { SOFT_BRAKE_PROMPT, HARD_BRAKE_PROMPT } from "../src/prompts.ts";
import { chooseBrakeLevel, usagePercent } from "../src/state.ts";

test("chooses no/soft/hard brake at configured thresholds", () => {
  const config = { enabled: true, softThresholdPercent: 88, hardThresholdPercent: 96, debug: false };

  assert.equal(chooseBrakeLevel(87.9, config), null);
  assert.equal(chooseBrakeLevel(88, config), "soft");
  assert.equal(chooseBrakeLevel(95.9, config), "soft");
  assert.equal(chooseBrakeLevel(96, config), "hard");
  assert.equal(chooseBrakeLevel(99, { ...config, enabled: false }), null);
});

test("uses reported context percent before token fallback", () => {
  assert.equal(
    usagePercent({ tokens: 10, contextWindow: 1000, percent: 42 }, [{ role: "user", content: "hello" }]),
    42,
  );
  assert.equal(usagePercent({ tokens: 880, contextWindow: 1000, percent: null }, []), 88);
});

test("estimates context percent from messages when tokens are unknown", () => {
  const percent = usagePercent(
    { tokens: null, contextWindow: 1000, percent: null },
    [{ role: "user", content: "x".repeat(880) }],
  );

  assert.equal(percent, 22);
});

test("loads project contextBrake settings over global settings", () => {
  const root = mkdtempSync(join(tmpdir(), "context-brake-"));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;

  try {
    const agentDir = join(root, "agent");
    const cwd = join(root, "project");
    mkdirSync(agentDir, { recursive: true });
    mkdirSync(join(cwd, ".pi"), { recursive: true });

    writeFileSync(
      join(agentDir, "settings.json"),
      JSON.stringify({ contextBrake: { enabled: true, softThresholdPercent: 80, hardThresholdPercent: 90, debug: true } }),
    );
    writeFileSync(
      join(cwd, ".pi", "settings.json"),
      JSON.stringify({ contextBrake: { softThresholdPercent: 88 } }),
    );
    process.env.PI_CODING_AGENT_DIR = agentDir;

    assert.deepEqual(loadConfig(cwd), {
      enabled: true,
      softThresholdPercent: 88,
      hardThresholdPercent: 90,
      debug: true,
    });
  } finally {
    if (previousAgentDir === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("exports distinct soft and hard brake prompts", () => {
  assert.match(SOFT_BRAKE_PROMPT, /TEMPORARY CONTROLLER INSTRUCTION: SOFT BRAKE/);
  assert.match(SOFT_BRAKE_PROMPT, /Do not mention, quote, summarize, reveal, or explain/);
  assert.match(SOFT_BRAKE_PROMPT, /Use tools only if required to close that current step/);
  assert.match(HARD_BRAKE_PROMPT, /TEMPORARY CONTROLLER INSTRUCTION: HARD BRAKE/);
  assert.match(HARD_BRAKE_PROMPT, /Do not start new tools, subtasks, exploration/);
});
