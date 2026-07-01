import test from "node:test";
import assert from "node:assert/strict";
import { appendBrakeToProviderPayload, appendBrakeToProviderPayloadWithMetadata } from "../src/payload.ts";

const prompt = "BRAKE";

test("appends to chat-completion style string messages", () => {
  const result = appendBrakeToProviderPayload({ messages: [{ role: "user", content: "hello" }] }, prompt);

  assert.deepEqual(result, { messages: [{ role: "user", content: "hello\n\nBRAKE" }] });
});

test("appends to chat-completion typed text content", () => {
  const result = appendBrakeToProviderPayload(
    { messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }] },
    prompt,
  );

  assert.deepEqual(result, {
    messages: [{ role: "user", content: [{ type: "text", text: "hello" }, { type: "text", text: "BRAKE" }] }],
  });
});

test("appends to plain text block messages", () => {
  const result = appendBrakeToProviderPayload({ messages: [{ role: "user", content: [{ text: "hello" }] }] }, prompt);

  assert.deepEqual(result, {
    messages: [{ role: "user", content: [{ text: "hello" }, { text: "BRAKE" }] }],
  });
});

test("appends to OpenAI Responses input payloads", () => {
  const result = appendBrakeToProviderPayload(
    { input: [{ role: "user", content: [{ type: "input_text", text: "hello" }] }] },
    prompt,
  );

  assert.deepEqual(result, {
    input: [{ role: "user", content: [{ type: "input_text", text: "hello" }, { type: "input_text", text: "BRAKE" }] }],
  });
});

test("appends to string input payloads", () => {
  const result = appendBrakeToProviderPayload({ input: "hello" }, prompt);

  assert.deepEqual(result, { input: "hello\n\nBRAKE" });
});

test("appends to Google contents payloads", () => {
  const result = appendBrakeToProviderPayload({ contents: [{ role: "user", parts: [{ text: "hello" }] }] }, prompt);

  assert.deepEqual(result, { contents: [{ role: "user", parts: [{ text: "hello" }, { text: "BRAKE" }] }] });
});

test("appends to Codex instructions as a fallback", () => {
  const result = appendBrakeToProviderPayload({ instructions: "system" }, prompt);

  assert.deepEqual(result, { instructions: "system\n\nBRAKE" });
});

test("leaves unknown payload shapes unchanged", () => {
  const payload = { model: "custom" };

  assert.equal(appendBrakeToProviderPayload(payload, prompt), payload);
});

test("reports metadata when mutating a known payload shape", () => {
  const result = appendBrakeToProviderPayloadWithMetadata({ messages: [{ role: "user", content: "hello" }] }, prompt);

  assert.deepEqual(result.payload, { messages: [{ role: "user", content: "hello\n\nBRAKE" }] });
  assert.deepEqual(result.metadata, {
    mutated: true,
    shape: "messages",
    mutation: "appended to chat messages",
    promptChars: 5,
  });
});

test("reports metadata when payload shape is unknown", () => {
  const payload = { model: "custom" };
  const result = appendBrakeToProviderPayloadWithMetadata(payload, prompt);

  assert.equal(result.payload, payload);
  assert.deepEqual(result.metadata, {
    mutated: false,
    shape: "unknown",
    mutation: "no known appendable payload field found; left unchanged",
    promptChars: 5,
  });
});
