type JsonObject = Record<string, unknown>;

type MessageContentKind = "string" | "typedText" | "plainTextBlock";

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function appendToString(value: string, prompt: string): string {
  return value.trim().length > 0 ? `${value}\n\n${prompt}` : prompt;
}

function detectMessageContentKind(messages: JsonObject[]): MessageContentKind {
  for (const message of messages) {
    const content = message.content;
    if (typeof content === "string") {
      return "string";
    }
    if (!Array.isArray(content)) {
      continue;
    }
    for (const block of content) {
      if (!isObject(block)) {
        continue;
      }
      if (block.type === "text") {
        return "typedText";
      }
      if (typeof block.text === "string") {
        return "plainTextBlock";
      }
    }
  }
  return "string";
}

function makeMessageContent(prompt: string, kind: MessageContentKind): unknown {
  if (kind === "typedText") {
    return [{ type: "text", text: prompt }];
  }
  if (kind === "plainTextBlock") {
    return [{ text: prompt }];
  }
  return prompt;
}

function appendPromptToMessage(message: JsonObject, prompt: string, kind: MessageContentKind): JsonObject {
  const content = message.content;
  if (typeof content === "string") {
    return { ...message, content: appendToString(content, prompt) };
  }
  if (Array.isArray(content)) {
    const block = kind === "plainTextBlock" ? { text: prompt } : { type: "text", text: prompt };
    return { ...message, content: [...content, block] };
  }
  return { ...message, content: makeMessageContent(prompt, kind) };
}

function appendToMessages(messages: unknown[], prompt: string): unknown[] {
  const objects = messages.filter(isObject);
  const kind = detectMessageContentKind(objects);
  const output = [...messages];
  const last = output[output.length - 1];

  if (isObject(last) && last.role === "user") {
    output[output.length - 1] = appendPromptToMessage(last, prompt, kind);
    return output;
  }

  output.push({ role: "user", content: makeMessageContent(prompt, kind) });
  return output;
}

function appendToResponsesContent(content: unknown, prompt: string): unknown {
  if (typeof content === "string") {
    return appendToString(content, prompt);
  }
  if (Array.isArray(content)) {
    return [...content, { type: "input_text", text: prompt }];
  }
  return [{ type: "input_text", text: prompt }];
}

function appendToResponsesInput(input: unknown[], prompt: string): unknown[] {
  const output = [...input];
  const last = output[output.length - 1];

  if (isObject(last) && last.role === "user") {
    output[output.length - 1] = {
      ...last,
      content: appendToResponsesContent(last.content, prompt),
    };
    return output;
  }

  output.push({ role: "user", content: [{ type: "input_text", text: prompt }] });
  return output;
}

function appendToGoogleContents(contents: unknown[], prompt: string): unknown[] {
  const output = [...contents];
  const last = output[output.length - 1];

  if (isObject(last) && last.role === "user") {
    const parts = Array.isArray(last.parts) ? last.parts : [];
    output[output.length - 1] = {
      ...last,
      parts: [...parts, { text: prompt }],
    };
    return output;
  }

  output.push({ role: "user", parts: [{ text: prompt }] });
  return output;
}

/**
 * Append brake guidance to the final serialized provider payload.
 *
 * Pi providers use a few payload shapes (`messages`, OpenAI Responses `input`,
 * or Gemini `contents`). This helper keeps the edit best-effort and local to
 * the current request; it does not touch session history.
 */
export function appendBrakeToProviderPayload(payload: unknown, prompt: string): unknown {
  if (!isObject(payload)) {
    return payload;
  }

  if (Array.isArray(payload.input)) {
    return { ...payload, input: appendToResponsesInput(payload.input, prompt) };
  }

  if (typeof payload.input === "string") {
    return { ...payload, input: appendToString(payload.input, prompt) };
  }

  if (Array.isArray(payload.contents)) {
    return { ...payload, contents: appendToGoogleContents(payload.contents, prompt) };
  }

  if (Array.isArray(payload.messages)) {
    return { ...payload, messages: appendToMessages(payload.messages, prompt) };
  }

  if (typeof payload.instructions === "string") {
    return { ...payload, instructions: appendToString(payload.instructions, prompt) };
  }

  return payload;
}
