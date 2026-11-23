import type { RuleSet } from "../../engine/types";
import { useI18n } from "../i18n";
import { RULE_SET_OPTIONS, ruleSetLabel, ruleSetSize } from "../ruleSets";

/** Rule set dropdown (lobby and solo setup). Each option says how many companies it puts on the board. */
export function RuleSetSelect({
  value,
  onChange,
  id,
}: {
  value: RuleSet;
  onChange: (v: RuleSet) => void;
  id?: string;
}) {
  const { t, tp } = useI18n();
  const label = (rs: RuleSet) => `${t(ruleSetLabel(rs))} · ${tp("set.companies", ruleSetSize(rs))}`;
  return (
    <select
      id={id}
      className="select"
      value={value}
      aria-label={t("set.ruleSet")}
      onChange={(e) => onChange(e.target.value as RuleSet)}
    >
      {RULE_SET_OPTIONS.map((rs) => (
        <option key={rs} value={rs}>
          {label(rs)}
        </option>
      ))}
    </select>
  );
}
