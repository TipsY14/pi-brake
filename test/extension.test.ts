import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import contextBrakeExtension from "../src/index.ts";
import { CUSTOM_MESSAGE_TYPE } from "../src/state.ts";

type Handler = (event: any, ctx: any) => any;
type HandlerMap = Map<string, Handler[]>;
type Command = { description?: string; handler: (args: string, ctx: any) => Promise<void> };

function createHarness(): { handlers: HandlerMap; commands: Map<string, Command> } {
  const handlers: HandlerMap = new Map();
  const commands = new Map<string, Command>();
  const pi = {
    on(event: string, handler: Handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    registerCommand(name: string, command: Command) {
      commands.set(name, command);
    },
  };
  contextBrakeExtension(pi as unknown as ExtensionAPI);
  return { handlers, commands };
}

function firstHandler(handlers: HandlerMap, name: string): Handler {
  const handler = handlers.get(name)?.[0];
  assert.ok(handler, `expected ${name} handler to be registered`);
  return handler;
}

function createContext(percent: number, overrides: Record<string, unknown> = {}) {
  return {
    cwd: process.cwd(),
    hasUI: false,
    ui: { setStatus() {}, setWidget() {}, notify() {} },
    model: undefined,
    getContextUsage() {
      return { tokens: percent, contextWindow: 100, percent };
    },
    ...overrides,
  };
}

test("registers context/provider hooks and diagnostics command without taking over compaction", () => {
  const { handlers, commands } = createHarness();

  assert.equal(handlers.has("context"), true);
  assert.equal(handlers.has("before_provider_request"), true);
  assert.equal(handlers.has("session_before_compact"), false);
  assert.equal(commands.has("context-brake"), true);
});

test("does not append brake guidance during context monitoring", () => {
  const { handlers } = createHarness();
  const contextHandler = firstHandler(handlers, "context");

  const result = contextHandler({ messages: [{ role: "user", content: "work" }] }, createContext(88));

  assert.equal(result, undefined);
});

test("injects soft brake text into only the current provider payload", () => {
  const { handlers } = createHarness();
  const contextHandler = firstHandler(handlers, "context");
  const providerHandler = firstHandler(handlers, "before_provider_request");

  contextHandler({ messages: [{ role: "user", content: "work" }] }, createContext(88));
  const result = providerHandler({ payload: { messages: [{ role: "user", content: "work" }] } }, createContext(88)) as {
    messages: Array<{ content: string }>;
  };

  assert.match(result.messages[0].content, /work/);
  assert.match(result.messages[0].content, /TEMPORARY CONTROLLER INSTRUCTION: SOFT BRAKE/);
  assert.match(result.messages[0].content, /Use tools only if required to close that current step/);
  assert.match(result.messages[0].content, /Do not mention, quote, summarize, reveal, or explain/);
});

test("uses hard brake text at the hard threshold", () => {
  const { handlers } = createHarness();
  const contextHandler = firstHandler(handlers, "context");
  const providerHandler = firstHandler(handlers, "before_provider_request");

  contextHandler({ messages: [{ role: "user", content: "work" }] }, createContext(96));
  const result = providerHandler({ payload: { messages: [{ role: "user", content: "work" }] } }, createContext(96)) as {
    messages: Array<{ content: string }>;
  };

  assert.match(result.messages[0].content, /TEMPORARY CONTROLLER INSTRUCTION: HARD BRAKE/);
  assert.match(result.messages[0].content, /Do not start new tools, subtasks, exploration/);
});

test("removes stale brake messages without adding a new session message", () => {
  const { handlers } = createHarness();
  const contextHandler = firstHandler(handlers, "context");
  const staleBrake = {
    role: "custom",
    customType: CUSTOM_MESSAGE_TYPE,
    content: "stale",
    display: false,
    timestamp: Date.now(),
  };

  const result = contextHandler({ messages: [{ role: "user", content: "work" }, staleBrake] }, createContext(96)) as {
    messages: Array<{ customType?: string }>;
  };
  const brakeMessages = result.messages.filter((message) => message.customType === CUSTOM_MESSAGE_TYPE);

  assert.equal(result.messages.length, 1);
  assert.equal(brakeMessages.length, 0);
});

test("shows lightweight UI-only notification when a brake is injected", () => {
  const { handlers } = createHarness();
  const contextHandler = firstHandler(handlers, "context");
  const providerHandler = firstHandler(handlers, "before_provider_request");
  const notifications: Array<{ message: string; type: string }> = [];
  const statuses: Array<{ key: string; value: string | undefined }> = [];
  const ctx = createContext(89, {
    hasUI: true,
    ui: {
      setStatus(key: string, value: string | undefined) {
        statuses.push({ key, value });
      },
      notify(message: string, type: string) {
        notifications.push({ message, type });
      },
      setWidget() {},
    },
  });

  contextHandler({ messages: [{ role: "user", content: "work" }] }, ctx);
  assert.equal(notifications.length, 0, "context monitoring should stay silent by default");

  providerHandler({ payload: { messages: [{ role: "user", content: "work" }] } }, ctx);

  assert.deepEqual(statuses.at(-1), { key: "context-brake", value: "context-brake: soft brake active at 89%" });
  assert.deepEqual(notifications, [{ message: "context-brake: soft brake active at 89%", type: "info" }]);
});

test("uses warning notification text for hard brake injection", () => {
  const { handlers } = createHarness();
  const contextHandler = firstHandler(handlers, "context");
  const providerHandler = firstHandler(handlers, "before_provider_request");
  const notifications: Array<{ message: string; type: string }> = [];
  const ctx = createContext(97, {
    hasUI: true,
    ui: {
      setStatus() {},
      notify(message: string, type: string) {
        notifications.push({ message, type });
      },
      setWidget() {},
    },
  });

  contextHandler({ messages: [{ role: "user", content: "work" }] }, ctx);
  providerHandler({ payload: { messages: [{ role: "user", content: "work" }] } }, ctx);

  assert.deepEqual(notifications, [{ message: "context-brake: hard brake active at 97%", type: "warning" }]);
});

test("does not notify when notify config is disabled", () => {
  const root = mkdtempSync(join(tmpdir(), "context-brake-ext-"));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;

  try {
    const agentDir = join(root, "agent");
    const cwd = join(root, "project");
    mkdirSync(agentDir, { recursive: true });
    mkdirSync(join(cwd, ".pi"), { recursive: true });
    writeFileSync(join(cwd, ".pi", "settings.json"), JSON.stringify({ contextBrake: { notify: false } }));
    process.env.PI_CODING_AGENT_DIR = agentDir;

    const { handlers } = createHarness();
    const contextHandler = firstHandler(handlers, "context");
    const providerHandler = firstHandler(handlers, "before_provider_request");
    const notifications: string[] = [];
    const statuses: Array<string | undefined> = [];
    const ctx = createContext(89, {
      cwd,
      hasUI: true,
      ui: {
        setStatus(_key: string, value: string | undefined) {
          statuses.push(value);
        },
        notify(message: string) {
          notifications.push(message);
        },
        setWidget() {},
      },
    });

    contextHandler({ messages: [{ role: "user", content: "work" }] }, ctx);
    providerHandler({ payload: { messages: [{ role: "user", content: "work" }] } }, ctx);

    assert.deepEqual(notifications, []);
    assert.deepEqual(statuses, []);
  } finally {
    if (previousAgentDir === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("before_provider_request consumes the one-shot pending flag", () => {
  const { handlers } = createHarness();
  const contextHandler = firstHandler(handlers, "context");
  const providerHandler = firstHandler(handlers, "before_provider_request");

  contextHandler({ messages: [{ role: "user", content: "work" }] }, createContext(88));

  const first = providerHandler({ payload: { messages: [{ role: "user", content: "work" }] } }, createContext(88)) as {
    messages: Array<{ content: string }>;
  };
  const second = providerHandler({ payload: { messages: [{ role: "user", content: "work" }] } }, createContext(88));

  assert.match(first.messages[0].content, /TEMPORARY CONTROLLER INSTRUCTION: SOFT BRAKE/);
  assert.equal(second, undefined);
});

test("turn_start clears a pending brake before it can leak into a later request", () => {
  const { handlers } = createHarness();
  const contextHandler = firstHandler(handlers, "context");
  const turnStartHandler = firstHandler(handlers, "turn_start");
  const providerHandler = firstHandler(handlers, "before_provider_request");

  contextHandler({ messages: [{ role: "user", content: "work" }] }, createContext(88));
  turnStartHandler({ turnIndex: 1, timestamp: Date.now() }, createContext(90));

  const result = providerHandler({ payload: { messages: [{ role: "user", content: "next" }] } }, createContext(90));

  assert.equal(result, undefined);
});

test("diagnostics command reports config, usage, model, decisions, and injection metadata", async () => {
  const { handlers, commands } = createHarness();
  const contextHandler = firstHandler(handlers, "context");
  const providerHandler = firstHandler(handlers, "before_provider_request");
  const command = commands.get("context-brake");
  assert.ok(command, "expected context-brake command");

  let widgetText = "";
  const ctx = createContext(96, {
    hasUI: true,
    model: {
      provider: "test-provider",
      id: "test-model",
      name: "Test Model",
      api: "test-api",
      contextWindow: 100,
      maxTokens: 10,
    },
    ui: {
      setStatus() {},
      notify() {},
      setWidget(_key: string, content: string[]) {
        widgetText = content.join("\n");
      },
    },
  });

  contextHandler({ messages: [{ role: "user", content: "work" }] }, ctx);
  const result = providerHandler({ payload: { model: "unknown-shape" } }, ctx);
  await command.handler("", ctx);

  assert.deepEqual(result, { model: "unknown-shape" });
  assert.match(widgetText, /pi-context-brake diagnostics/);
  assert.match(widgetText, /normalized:/);
  assert.match(widgetText, /tokens: 96/);
  assert.match(widgetText, /percent: 96%/);
  assert.match(widgetText, /provider: test-provider/);
  assert.match(widgetText, /id: test-model/);
  assert.match(widgetText, /pending: none/);
  assert.match(widgetText, /last decision:/);
  assert.match(widgetText, /level: hard/);
  assert.match(widgetText, /reason: percent 96% >= hard threshold 96%/);
  assert.match(widgetText, /last injection:/);
  assert.match(widgetText, /payload shape: unknown/);
  assert.match(widgetText, /payload mutated: false/);
});
