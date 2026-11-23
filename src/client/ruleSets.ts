import { companiesFor } from "../engine/rules";
import { RULE_SETS, type RuleSet } from "../engine/types";
import type { MsgKey } from "../shared/i18n";

/** Rule sets in picker order: the show's set, randomized, then the hand-made boards. */
export const RULE_SET_OPTIONS: readonly RuleSet[] = RULE_SETS;

const LABEL: Record<RuleSet, MsgKey> = {
  show: "set.ruleShow",
  random: "set.ruleRandom",
  beginning: "set.ruleBeginning",
  season2: "set.ruleSeason2",
  grand: "set.ruleGrand",
};

export const ruleSetLabel = (rs: RuleSet): MsgKey => LABEL[rs];

/** Number of companies on the board for a rule set. */
export const ruleSetSize = (rs: RuleSet): number => companiesFor(rs).length;
