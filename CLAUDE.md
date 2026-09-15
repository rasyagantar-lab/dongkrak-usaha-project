# Working Rules for This Repository

This file is a pointer, not the source of truth. The project's memory lives in three places and they are mandatory reading, not optional notes:

- `PROJECT_KNOWLEDGE.md` — current state, verified findings, open problems, decisions. Read it before any task. Update it after.
- `AI_MODELS.md` — model/provider/key registry and the numbered rules (1A–1I) every AI feature must follow. Read it before touching any agent, route, or provider.
- `ai-agents/<feature>.md` — one contract per agent. Read the relevant one before changing that agent's code or prompt. These six are also **live runtime input**: `server.ts` prepends each one to its agent's prompt on every call, and agents append to their own `## Self-Improvement Log`. Editing one changes behaviour on the next call.

## The cycle, every task
1. Read the MD files above that touch the task.
2. Do the work.
3. Run the smallest verification that proves it (`npx tsc --noEmit`, `npm run build`, a real curl, a real browser check).
4. Record what changed, why, what was verified, and what remains — in the MD files — before calling the task done.

A task without step 4 is not finished.

## Evidence discipline
- Status vocabulary: HYPOTHESIS → SUPPORTED → FIXED BUT UNVERIFIED → PROVEN / VERIFIED. Never claim the higher rung without runtime evidence.
- Never state a model, provider, or API is available from memory or documentation alone (AI_MODELS.md Rule 4). Probe it.
- Do not re-investigate bugs already marked PROVEN/FIXED in `PROJECT_KNOWLEDGE.md` without fresh evidence.

## Secrets
Never write an API key, token, cookie, or credential value into any markdown or source file. Secrets live only in `.env` (git-ignored). Record at most: "credential is stored in `.env`."

## Operational gotchas (learned the hard way, see PROJECT_KNOWLEDGE.md)
- `npm run dev` is `tsx server.ts` with no watch: server-side changes need a full restart. A `.env` edit while running needs a full process kill (`Get-Process node | Stop-Process -Force`) then `npm run dev` — Vite's "restarting" log line is not enough.
- `public/extension/` is the only extension source of truth.
- Campaign/history data persists in `data/`; `public/base-photos/` and `public/generated-images/` hold user artwork. All git-ignored.

## Roles (set by the user, 2026-09-15)
- This repo (and the developer working in it) is the ONLY source of code changes: development, debugging, verification, documentation.
- Google AI Studio is **hosting only**. It runs the app; it does not develop it. Never adopt edits from an AI Studio export back into this repo -- if its copy drifts, re-push ours. Its exports have been shown to alter `server.ts`, `.env.example`, and drop the `Dockerfile` (see PROJECT_KNOWLEDGE.md, EXPERIMENT section).
- Deploy direction is one-way: repo -> AI Studio. Verify each deploy by its `[Startup]` log lines, never by AI Studio's own claims.

## Branches (as of 2026-09-14)
- `master` = proven local/LAN state (checkpoint `29781fe`). `experiment/cloud-run` = Cloud Run hosting experiment, UNVERIFIED. Do not merge the experiment into master without a successful real deploy and the user's say-so. Read the "EXPERIMENT" section in PROJECT_KNOWLEDGE.md before touching either.
- Storage mode is decided solely by the `GCS_BUCKET` env var (`server/storage.ts`): absent = local disk, exactly as master behaves.

## UI conventions
- Tailwind utilities only for animation (`transition-*`, `duration-*`, `motion-reduce:`). The `motion`/`framer-motion` package is not used; do not introduce it.
- Animate only `transform` and `opacity`. No `backdrop-filter: blur()`. Target hardware is ≤8GB-RAM laptops with integrated GPUs.
- Every tab stays mounted (`TabPanel` in App.tsx); never reintroduce a tab-keyed remount. Long-running work goes through the Job Center (`src/jobs.tsx`, `startJob`), not panel-local state, so it survives tab and campaign switches and shows in the job tray.
- `vite.config.ts` ignores `ai-agents/`, `data/`, `*.md` and generated images in the watcher. Runtime writes to those paths used to full-reload the page mid-run. Keep that list intact.
