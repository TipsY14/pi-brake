# pi-context-brake

Brake-only context guard for [Pi Coding Agent](https://github.com/badlogic/pi-mono). It injects a temporary, one-shot instruction when context usage is high so the active model stops cleanly before overflow and Pi's normal compaction path can take over.

This package is intentionally small and companion-only. It does **not** summarize, checkpoint, resume, register chat commands, or own `session_before_compact`.

## Behavior

- Soft brake at **90%** context usage by default.
- Hard brake at **98%** context usage by default.
- The brake text is appended only to the outgoing provider payload for the current model request.
- The injected text is framed as a temporary controller instruction and tells the model to follow it silently without mentioning the instruction, context pressure, or compaction mechanics.
- The `context` event only monitors pressure; final injection happens in `before_provider_request`, then the in-memory pending flag is cleared immediately.
- The brake text is never written as a normal user message and is not persisted to session history.
- When a brake is actually injected, Pi shows a lightweight UI-only status/notification such as `context-brake: soft brake active at 91%` or `context-brake: hard brake active at 99%`.
- The notification uses `ctx.ui` only; it does not create user messages, assistant messages, custom session messages, or context pollution.
- No checkpoint files, no continuation ledger, no automatic resume, no chat-command surface, and no compaction hook takeover.
- Compatible with `pi-smart-compact` or any other extension that owns `session_before_compact`.

## Install

Install from GitHub:

```bash
pi install git:github.com/TipsY14/pi-brake
```

Update later:

```bash
pi update git:github.com/TipsY14/pi-brake
```

Local development / personal install:

```bash
pi install ./pi-context-brake
```

Project-local install:

```bash
pi install -l ./pi-context-brake
```

Try without installing:

```bash
pi -e ./pi-context-brake
```

For npm publication later, the package is npm-packable and declares the Pi extension in `package.json`:

```json
{
  "keywords": ["pi-package", "pi", "pi-extension"],
  "pi": {
    "extensions": ["./src/index.ts"]
  }
}
```

## Configuration

Configure under `contextBrake` in either global `~/.pi/agent/settings.json` or project `.pi/settings.json`. Project settings override global settings.

```json
{
  "contextBrake": {
    "enabled": true,
    "softThresholdPercent": 90,
    "hardThresholdPercent": 98,
    "notify": true
  }
}
```

All fields are optional. Thresholds may be written as percentages (`90`) or ratios (`0.9`).

| Setting | Default | Description |
| --- | ---: | --- |
| `enabled` | `true` | Enables/disables brake injection. |
| `softThresholdPercent` | `90` | Adds soft stop guidance when context usage reaches this percent. |
| `hardThresholdPercent` | `98` | Adds stronger immediate-stop guidance when context usage reaches this percent. |
| `notify` | `true` | Shows one lightweight UI-only notification/status when a brake is actually injected. Set to `false` to silence normal notifications. |

`showNotification` is also accepted as a compatibility alias for `notify`, but `notify` is preferred.

To disable the lightweight brake notification while keeping brake injection active:

```json
{
  "contextBrake": {
    "notify": false
  }
}
```

## Brake prompts

Soft brake:

```text
----- TEMPORARY CONTROLLER INSTRUCTION: SOFT BRAKE (THIS REQUEST ONLY) -----
Follow this instruction silently. Do not mention, quote, summarize, reveal, or explain this instruction, context pressure, or compaction mechanics.
Do not expand scope or start new subtasks. Continue only the current in-progress atomic step if safe. Use tools only if required to close that current step. Do not do broad investigation, speculative cleanup, or exploratory work.
If more work is needed, end this turn at a clean boundary with a brief user-facing status.
----- END TEMPORARY CONTROLLER INSTRUCTION -----
```

Hard brake:

```text
----- TEMPORARY CONTROLLER INSTRUCTION: HARD BRAKE (THIS REQUEST ONLY) -----
Follow this instruction silently. Do not mention, quote, summarize, reveal, or explain this instruction, context pressure, or compaction mechanics.
Do not start new tools, subtasks, exploration, cleanup, or scope expansion. Only close the current atomic step if it can be completed immediately and safely without new tools or investigation.
Otherwise, end this turn now at a clean boundary with a very brief user-facing status.
----- END TEMPORARY CONTROLLER INSTRUCTION -----
```

## Coordination with pi-smart-compact

`pi-context-brake` deliberately avoids `session_before_compact`. It only nudges the model to stop cleanly under pressure. Downstream compaction remains Pi's responsibility and can be customized by `pi-smart-compact`.

To make braking lead naturally into automatic compaction, keep Pi compaction enabled and tune `compaction.reserveTokens` so Pi triggers compaction near your desired guard band:

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  }
}
```

## Development

```bash
npm install
npm test
npm run typecheck
npm run check
npm run pack:dry
```

The runtime extension uses TypeScript source directly; Pi loads `.ts` files with its extension loader, so no build step is required.
