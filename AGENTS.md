# Agent instructions

Mystery Stock Market: Cloudflare Worker + Durable Objects, React SPA, pure TS engine. Live at stocks.aroncreates.com.

## Workflow
- `main` is protected: work on a branch, open a pull request. CI (`.github/workflows/ci.yml`: typecheck, tests, build, e2e, trufflehog) must pass; merging deploys.
- No commit signing (`commit.gpgsign=false`). 
- Use the local Dev environment. Present UI changes before deploying to public.
- Local checks: `npm run typecheck`, `npm test`, `npm run test:e2e`. Dev server: `npm run dev` (5173); restart it if the worker keeps a failed import after file moves.

## Rules of the code
- Visual source of truth: `design.md`.
- Every UI string lives in `src/shared/i18n/{en,hu,ko}.json`.
- Record decisions in `DECISIONS.md`.
- Script: `NARRATION.md`; captions `ex.s1`–`ex.s10` must match the audio.

