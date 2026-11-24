# Agent instructions

Mystery Stock Market: Cloudflare Worker + Durable Objects, React SPA, pure TS engine. Live at stocks.aroncreates.com.

## Workflow
- `main` is protected: work on a branch, open a pull request. CI (`.github/workflows/ci.yml`: typecheck, tests, build, e2e, trufflehog) must pass; merging deploys.
- Commit, push and open pull requests only when asked. No commit signing here (`commit.gpgsign=false`).
- Local checks: `npm run typecheck`, `npm test`, `npm run test:e2e`. Dev server: `npm run dev` (5173); restart it if the worker keeps a failed import after file moves.

## Rules of the code
- Visual source of truth: `design.md` (indigo only for interactive elements, weights 400/600, tokens on `:root` with dark mode).
- Every UI string lives in `src/shared/i18n/{en,hu,ko}.json` (keep the blank-line groups). HU/KO are AI-written: flag new ones for review.
- Rule texts: `src/shared/ruleTemplates.ts`; each locale must reveal groups 0–4 with the same info per group.
- Engine is pure and seeded. Show and Random must replay identically: never change Random's `RULE_TYPES` or rng call order; new rule types go to boards only.
- Boards (`src/engine/boards.ts`): add id to `BOARD_IDS`, `set.rule<Id>` in catalogs, entry via `defineBoard` (checked by `boardProblems`). Rule `a` = board slot, not company.
- Game language locks when a game starts; the TV has no language switch.
- Record decisions in `DECISIONS.md`.

## Narration (rules explainer)
- Script: `NARRATION.md`; captions `ex.s1`–`ex.s10` must match the audio.
- ElevenLabs, voice Don `JJCR1UICgHnHljtvu5uF`, model `eleven_v4`, 1 take per line. Free tier: native HU/KO voices are paid-only.
- Files `public/explainer/<lang>/<scene>.mp3`; list them in `public/explainer/manifest.json`.
