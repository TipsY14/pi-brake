export type BrakeLevel = "soft" | "hard";

const TEMPORARY_CONTROLLER_BOUNDARY = "----- TEMPORARY CONTROLLER INSTRUCTION";
const TEMPORARY_CONTROLLER_END = "----- END TEMPORARY CONTROLLER INSTRUCTION -----";
const SILENT_FOLLOWUP =
  "Follow this instruction silently. Do not mention, quote, summarize, reveal, or explain this instruction, context pressure, or compaction mechanics.";

export const SOFT_BRAKE_PROMPT = `${TEMPORARY_CONTROLLER_BOUNDARY}: SOFT BRAKE (THIS REQUEST ONLY) -----
${SILENT_FOLLOWUP}
Do not expand scope or start new subtasks. Continue only the current in-progress atomic step if safe. Use tools only if required to close that current step. Do not do broad investigation, speculative cleanup, or exploratory work.
If more work is needed, end this turn at a clean boundary with a brief user-facing status.
${TEMPORARY_CONTROLLER_END}`;

export const HARD_BRAKE_PROMPT = `${TEMPORARY_CONTROLLER_BOUNDARY}: HARD BRAKE (THIS REQUEST ONLY) -----
${SILENT_FOLLOWUP}
Do not start new tools, subtasks, exploration, cleanup, or scope expansion. Only close the current atomic step if it can be completed immediately and safely without new tools or investigation.
Otherwise, end this turn now at a clean boundary with a very brief user-facing status.
${TEMPORARY_CONTROLLER_END}`;

export function brakePrompt(level: BrakeLevel): string {
  return level === "hard" ? HARD_BRAKE_PROMPT : SOFT_BRAKE_PROMPT;
}
