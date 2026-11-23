import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import en from "../../src/shared/i18n/en.json";
import hu from "../../src/shared/i18n/hu.json";
import ko from "../../src/shared/i18n/ko.json";
import { RULE_TEMPLATES } from "../../src/shared/ruleTemplates";

const esc = (s: string | undefined) => (s ?? "—").replace(/\|/g, "\\|").replace(/\n/g, " ");

it("every locale reveals rule groups 0..4 for every rule type", () => {
  for (const lang of ["en", "hu", "ko"] as const) {
    for (const [type, toks] of Object.entries(RULE_TEMPLATES[lang])) {
      const groups = [...new Set(toks.map(([g]) => g))].sort();
      expect(groups, `${lang} ${type}`).toEqual([0, 1, 2, 3, 4]);
    }
  }
});

it("writes I18N_REVIEW.md (with I18N_REPORT=1)", () => {
  const out: string[] = [];
  out.push("# I18N review: Hungarian and Korean");
  out.push("");
  out.push(
    "All Hungarian (`hu`) and Korean (`ko`) strings were written by the developer (an AI assistant), not by native speakers. Please review every line below. Edit the catalogs in `src/shared/i18n/<locale>.json` and the rule templates in `src/shared/ruleTemplates.ts`; this file is generated from them (see the bottom of this page).",
  );
  out.push("");
  out.push("## Things to check first");
  out.push("");
  out.push("- **Company names.** Korean uses transliterations (오픈 시큐리티, 코요테크, …) because the show's original Korean names could not be confirmed. Hungarian keeps the brand part in English and translates the descriptor (Latter Elektronika, Defense Acél, …). Replace them with the broadcast names if known.");
  out.push("- **Game title.** `app.name` is 미스터리 거래소 (the show's name for the game) in Korean and Rejtélyes Tőzsde in Hungarian.");
  out.push("- **Show credit** (`how.credit`): the Korean title of *The Devil's Plan* season 3 is written generically as 〈데블스 플랜〉 시즌 3.");
  out.push("- **Currency.** Mystery Mark is 미스터리 마크 / Rejtélymárka; the symbol ℳ goes before the number in `en`/`ko` and after it in `hu` (`currency.pattern`).");
  out.push("- **Hungarian articles.** Where a stock name follows an article the code picks `a`/`az` automatically (`{theA}` in rule templates). UI strings avoid `a(z)` by rephrasing; check they still read naturally.");
  out.push("- **Korean particles.** Rule templates pick 이/가 automatically (`{aSubj}`). UI strings that would need 을/를 or 이/가 after a stock name were rephrased as `label: {stock}`.");
  out.push("- **Reveal groups.** Each rule's tokens must reveal the *same information* at the same round in every language (group 0 at the start, 1 at round 5, 2 at 10, 3 at 15, 4 at 20). Word order may differ; the group of each piece of information must not.");
  out.push("- **Terms of art.** 피스 (piece), 비밀 (secret); in Hungarian the secret mechanic is called **elrejtés** („Részvény elrejtése”), and pieces are **zseton**.");
  out.push("");
  out.push("## UI strings");
  out.push("");
  out.push("| Key | English | Magyar | 한국어 |");
  out.push("|---|---|---|---|");
  const H = hu as Record<string, string>;
  const K = ko as Record<string, string>;
  for (const [k, v] of Object.entries(en as Record<string, string>)) {
    out.push(`| \`${k}\` | ${esc(v)} | ${esc(H[k])} | ${esc(K[k])} |`);
  }
  out.push("");
  out.push("## Rule templates");
  out.push("");
  out.push("Tokens are shown as `[group] text`. `{a}` / `{theA}` / `{aSubj}` = another company, `{x}` `{y}` `{p}` = amounts, `{l}` `{h}` `{k}` = counts.");
  out.push("");
  for (const type of Object.keys(RULE_TEMPLATES.en) as (keyof typeof RULE_TEMPLATES.en)[]) {
    out.push(`### \`${type}\``);
    out.push("");
    for (const lang of ["en", "hu", "ko"] as const) {
      const line = RULE_TEMPLATES[lang][type].map(([g, s]) => `[${g}] ${s}`).join(" · ");
      out.push(`- **${lang}**: ${line}`);
    }
    out.push("");
  }
  out.push("---");
  out.push("Regenerate: `npx vitest run --config vitest.config.ts test/engine/i18n-report.test.ts` with `I18N_REPORT=1`.");
  if (process.env.I18N_REPORT) writeFileSync("I18N_REVIEW.md", out.join("\n") + "\n");
});
