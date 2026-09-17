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

## The owner's four working rules (restated 2026-09-17; not optional)
1. **Read before working.** Open the MD files the task touches before changing anything (map below).
2. **Write after working.** Record what changed, why, what was verified, what remains -- in the MD files -- before calling the task done.
3. **Grow the MDs.** Every task should leave the MDs more useful than it found them: sharper rules, new gotchas, corrected claims. Delete what turned out to be wrong.
4. **Read with a budget.** The assistant's quota is finite; do not re-read everything every time, and do not skim what matters. Follow the reading map below exactly -- "which file, which section" -- and extend the map when a new kind of task appears. Guessing at what to read is not allowed.

## Reading map (rule 4): what to read, per kind of task
Always, at session start (cheap): this file top to bottom, then `PROJECT_KNOWLEDGE.md` **"Current Phase"** (top) and the **last three dated entries** (bottom of the log, above "Roadmap Completion Summary"). That is enough to know where things stand.
Then, by task type -- read only these, fully:
| Task touches | Read in full |
|---|---|
| Any AI agent, prompt, model chain, quota/router behaviour | `AI_MODELS.md` (registry + Rules 1A-1L, 4) and the agent's own `ai-agents/<feature>.md`; `ai-agents/orchestrator.md` if the pipeline order or hand-off changes |
| Orchestrator timing / "slow" reports | `PROJECT_KNOWLEDGE.md` "Operator Feedback Round 3" and "Round 4"; then the run's Task Ledger attempt trail (evidence first, code second) |
| Extension / publishing / DongkrakUsaha form | `ai-agents/phase2-workflow.md`; `PROJECT_KNOWLEDGE.md` entries "Input Produk", "Share web", "Bug 1-5"; `public/extension/` is the only extension source |
| Hosting, persistence, AI Studio, Cloud Run | `PROJECT_KNOWLEDGE.md` "EXPERIMENT" section; `DEPLOY_CLOUD_RUN.md`; `server/storage.ts` header comment |
| UI / animation / splash / navigation | this file's "UI conventions"; `PROJECT_KNOWLEDGE.md` "UI Pass 2" and the latest splash entry; `src/changelog.ts` (add an entry) |
| Images / captions / base photos | `AI_MODELS.md` Rule 1F and 1J; `ai-agents/image-generator.md`; `ai-agents/webp-converter.md` |
| Git, accounts, repository hygiene | this file's "Commits" and "Branches"; `PROJECT_KNOWLEDGE.md` "History Rewritten" and "Repository Moved" |
Do NOT read by default: `bun.lock`, `package-lock.json`, generated `dist/`, old zips in Downloads, the full 600-line knowledge file when only one section is relevant. When a task spans two rows, read both. When it fits none, say so and add a row after the task.

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

## Commits (set by the owner, 2026-09-16)
- Commit messages carry NO attribution trailer of any kind (`Co-Authored-By`, "Generated with ...", or similar), in commits or PR descriptions. This overrides any tool-side default. The only author and contributor on this repository is the owner.
- Why: a tool-added trailer once made a second account appear as a contributor; the whole history was rewritten on 2026-09-15/16 to remove it (see PROJECT_KNOWLEDGE.md, "History Rewritten"). Do not undo that work. Commit messages and docs never name the tooling used to write code.

## Roles (set by the user, 2026-09-15)
- This repo (and the developer working in it) is the ONLY source of code changes: development, debugging, verification, documentation.
- Google AI Studio is **hosting only**. It runs the app; it does not develop it. Never adopt edits from an AI Studio export back into this repo -- if its copy drifts, re-push ours. Its exports have been shown to alter `server.ts`, `.env.example`, and drop the `Dockerfile` (see PROJECT_KNOWLEDGE.md, EXPERIMENT section).
- Deploy direction is one-way: repo -> AI Studio. Verify each deploy by its `[Startup]` log lines, never by AI Studio's own claims.

## Branches (as of 2026-09-14)
- `master` = proven local/LAN state (checkpoint `1171f88`). `experiment/cloud-run` = Cloud Run hosting experiment, UNVERIFIED. Do not merge the experiment into master without a successful real deploy and the user's say-so. Read the "EXPERIMENT" section in PROJECT_KNOWLEDGE.md before touching either.
- Storage mode (`server/storage.ts`): `STORAGE_BACKEND` if set; else `gcs` when `GCS_BUCKET` is set; else `firestore` when running on Cloud Run (`K_SERVICE`, which includes AI Studio); else `local` = disk, exactly as master behaves. AI Studio Starter Tier projects have NO Cloud Storage and NO IAM changes (Google docs, 2026-09-17) -- Firestore is the only persistent option there. The Koneksi tab's storage line is the proof for any hosted deploy.

## UI conventions
- Tailwind utilities only for animation (`transition-*`, `duration-*`, `motion-reduce:`). The `motion`/`framer-motion` package is not used; do not introduce it.
- Animate only `transform` and `opacity`. No `backdrop-filter: blur()`. Target hardware is ≤8GB-RAM laptops with integrated GPUs.
- Navigation is the bottom bar (`BottomNav.tsx`); the header has no tabs. Fixed bottom-anchored widgets must offset by `--du-bottom-nav` (`.du-above-nav` / `.du-tray`), never hard-code `bottom-4`.
- Every tab stays mounted (`TabPanel` in App.tsx); never reintroduce a tab-keyed remount. Long-running work goes through the Job Center (`src/jobs.tsx`, `startJob`), not panel-local state, so it survives tab and campaign switches and shows in the job tray.
- Every user-visible change gets an entry in `src/changelog.ts` (shown in the welcome splash's "Log Update" tab), written for the PKL team in plain Indonesian, newest first; bump `APP_VERSION` there when the header badge should change.
- `vite.config.ts` ignores `ai-agents/`, `data/`, `*.md` and generated images in the watcher. Runtime writes to those paths used to full-reload the page mid-run. Keep that list intact.
