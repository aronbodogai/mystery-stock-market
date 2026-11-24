/**
 * What the MCP tools return: the seat's view compacted for an agent (same
 * information as the phone screen, company names resolved, text in the chosen
 * language), as JSON or as Markdown, plus error messages that say how to recover.
 */
import { STOCK_IDS } from "../../engine/constants";
import { formatMoney, formatNumber } from "../../shared/format";
import { hasKey, t, type MsgKey, type Params } from "../../shared/i18n";
import type { Lang } from "../../shared/lang";
import type { RuleToken, View } from "../../shared/protocol";

/** Responses stay well under this; views are small, so it only bounds the event list. */
export const CHARACTER_LIMIT = 25_000;
const EVENTS_SHOWN = 10;

export type ResponseFormat = "markdown" | "json";

export function companyName(lang: Lang, companies: readonly number[], slot: number): string {
  return t(lang, `stock.${STOCK_IDS[companies[slot] ?? slot]}` as MsgKey);
}

/** A room message code as text, the way the phone renders it. */
export function say(lang: Lang, prefix: "ev" | "toast" | "err", code: string, params: Params, companies: readonly number[]): string {
  const p: Params = { ...params };
  if (typeof p.stock === "number") p.stock = companyName(lang, companies, p.stock);
  if (typeof p.side === "string") p.side = t(lang, p.side === "buy" ? "trade.bought" : "trade.sold");
  if (typeof p.qty === "number") p.qty = formatNumber(p.qty, lang);
  const key = `${prefix}.${code}`;
  return hasKey(key) ? t(lang, key, p) : t(lang, `${prefix}.unknown` as MsgKey, { code });
}

const ruleText = (tokens: RuleToken[]) => tokens.map((x) => ("text" in x ? x.text : "[?]")).join(" ");

/** Changes whenever anything the seat can see changes; agents pass it to msm_wait_for_change. */
async function versionOf(view: View): Promise<string> {
  const { serverNow: _ignored, ...rest } = view;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(rest)));
  return [...new Uint8Array(digest).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type AgentView = Awaited<ReturnType<typeof agentView>>;

export async function agentView(view: View, lang: Lang) {
  const company = (slot: number) => companyName(lang, view.companies, slot);
  const secondsTo = (at: number | null) => (at === null ? null : Math.max(0, Math.round((at - view.serverNow) / 1000)));
  return {
    version: await versionOf(view),
    room_code: view.code,
    join_url: `${view.origin}/j/${view.code}`,
    phase: view.phase,
    game_no: view.gameNo,
    round: view.round,
    total_rounds: view.totalRounds,
    seconds_left: view.phase === "trading" ? secondsTo(view.deadline) : null,
    countdown_seconds: view.phase === "countdown" ? secondsTo(view.countdownEnd) : null,
    ends_early_in_seconds: secondsTo(view.earlyEndAt),
    reveal_level: view.revealLevel,
    next_reveal_round: view.nextReveal,
    you: view.you,
    config: view.config,
    seats: view.seats,
    players: view.lobby,
    stocks: view.stocks.map((s, slot) => ({
      slot,
      company: company(slot),
      price: s.price,
      change: s.delta,
      hidden: s.hidden,
      price_history: s.chart,
      last_round: s.last,
      rule: ruleText(s.rule),
      rule_level: s.level,
    })),
    me: view.me,
    standings: view.standings,
    ready: view.ready,
    any_secret: view.anySecret,
    events: view.events.slice(-EVENTS_SHOWN).map((e) => ({ round: e.round, code: e.code, text: say(lang, "ev", e.code, e.params, view.companies) })),
    results: view.results && {
      seed: view.results.seed,
      rule_set: view.results.ruleSet,
      rules: view.results.rules.map((tokens, slot) => ({ slot, company: company(slot), rule: tokens.map((x) => x.text).join(" ") })),
      ranking: view.results.ranking,
    },
  };
}

/** The view as readable Markdown, with the next useful tool calls. */
export function viewMarkdown(v: AgentView, lang: Lang): string {
  const money = (n: number | null) => (n === null ? "hidden" : formatMoney(n, lang));
  const isHost = v.you.role === "host";
  const out: string[] = [];
  const clock =
    v.phase === "trading" ? (v.seconds_left === null ? "no time limit" : `${v.seconds_left} s left`) : v.phase === "countdown" ? `starts in ${v.countdown_seconds} s` : null;
  out.push(`# Room ${v.room_code}: ${v.phase}${v.round ? `, round ${v.round}/${v.total_rounds}` : ""}${clock ? ` (${clock})` : ""}`);
  out.push(`You: ${v.you.name ?? "guest"} (${v.you.role}${v.you.seated ? ", seated" : ", not seated"}). Join link: ${v.join_url}`);

  if (v.phase === "lobby") {
    out.push("", `## Players (${v.seats.count}/${v.seats.max} seats, ${v.seats.min} needed)`);
    for (const p of v.players) {
      const tags = [p.host && "host", p.bot && "bot", p.agent && "AI agent", p.me && "you", !p.seated && "not playing"].filter(Boolean);
      out.push(`- ${p.name} (${p.id})${tags.length ? ` [${tags.join(", ")}]` : ""}`);
    }
    const c = v.config;
    out.push("", `Settings: rule set ${c.ruleSet}, rounds ${c.roundSeconds ? `${c.roundSeconds} s` : "no limit"}, end early ${c.endEarly}, bots ${c.botSkill}, host plays ${c.hostPlays}, agents allowed ${c.agents}, language ${c.lang}.`);
    out.push(isHost ? "Next: msm_configure_room, msm_add_bots, then msm_start_game." : "Next: msm_wait_for_change until the host starts the game.");
  }

  if (v.me) {
    const m = v.me;
    out.push(
      "",
      `## You`,
      `Cash ${money(m.cash)}, net worth ${money(m.net)}${m.blind ? " (hidden: you hold a hidden stock)" : ""}. Pieces ${m.pieces}. Secret: ${m.secretStock === null ? "unused" : `used on slot ${m.secretStock}`}. Ready: ${m.ready ? "yes" : "no"}.${m.frozen ? " Your seat is frozen." : ""}`,
    );
  }

  if (v.phase !== "lobby") {
    out.push("", "## Stocks", "| Slot | Company | Price | Change | You hold | Last round buy/sell/hold | Recent prices | Rule (? = hidden words) |", "| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const s of v.stocks) {
      const last = s.last_round ? `${s.last_round.buy}/${s.last_round.sell}/${s.last_round.hold}` : "-";
      const recent = s.price_history.slice(-5).map((p) => (p === null ? "?" : formatNumber(p, lang))).join(", ");
      const held = v.me?.shares[s.slot] ?? 0;
      out.push(`| ${s.slot} | ${s.company} | ${money(s.price)} | ${s.change === null ? "-" : `${s.change > 0 ? "+" : ""}${formatNumber(s.change, lang)}`} | ${held} | ${last} | ${recent} | ${s.rule} |`);
    }
    out.push("", `Rule words revealed up to level ${v.reveal_level}${v.next_reveal_round ? `; more in round ${v.next_reveal_round}` : ""}.`);
  }

  if (v.standings.length) {
    out.push("", "## Standings");
    for (const s of v.standings) {
      const tags = [s.bot && "bot", s.agent && "AI agent", s.me && "you", s.ready && "ready", s.frozen && "frozen"].filter(Boolean);
      out.push(`${s.rank}. ${s.name}: ${money(s.net)}${tags.length ? ` [${tags.join(", ")}]` : ""}`);
    }
    out.push(`Ready: ${v.ready.count}/${v.ready.total}${v.ends_early_in_seconds !== null ? `; round ends in ${v.ends_early_in_seconds} s` : ""}.`);
  }

  if (v.phase === "trading") out.push("", "Next: msm_trade, msm_place_secret or msm_use_piece, then msm_set_ready; msm_wait_for_change to follow the round.");

  if (v.results) {
    out.push("", "## Results");
    for (const r of v.results.ranking) out.push(`${r.rank}. ${r.name}: ${money(r.net)}${r.me ? " [you]" : ""}${r.bot ? " [bot]" : ""}`);
    out.push("", "## The hidden rules");
    for (const r of v.results.rules) out.push(`- ${r.company}: ${r.rule}`);
    if (isHost) out.push("", "Next: msm_new_game for another game in this room.");
  }

  if (v.events.length) {
    out.push("", "## Recent events");
    for (const e of v.events) out.push(`- ${e.round ? `R${e.round}: ` : ""}${e.text}`);
  }
  out.push("", `version: ${v.version} (pass to msm_wait_for_change)`);
  return out.join("\n");
}

/** How to recover, per error code: the room's message says what went wrong, this says what to do next. */
const RECOVERY: Record<string, string> = {
  bad_code: "Room codes are 5 letters or digits, e.g. K7Q2M.",
  not_found: "Check the room code. Lobbies close after 30 idle minutes; msm_create_room makes a new room.",
  unknown_token: "Use the token that msm_create_room or msm_join_room returned to this same account. To get a new seat, msm_join_room while the room is in its lobby.",
  not_host: "This needs the host token from msm_create_room.",
  game_started: "The game is running; you can still read it with msm_get_view, without a token.",
  name_taken: "Pick another name.",
  bad_name: "Use 1-16 visible characters.",
  room_full: "No free seats. Try another room or msm_create_room.",
  room_busy: "The room has too many connections. Wait a few seconds and try again.",
  agents_off: "Ask the host to allow AI agents, or create your own room with msm_create_room.",
  not_seated: "You need a seat in a running game: join in the lobby, then wait for msm_start_game.",
  not_trading: "Trading is closed. Call msm_wait_for_change until phase is trading.",
  paused: "Call msm_wait_for_change until the host resumes.",
  lobby_only: "Settings and bots can only be changed in the lobby.",
  need_players: "Add bots with msm_add_bots, or wait for players to join.",
  insufficient_cash: "Buy fewer shares: qty × price must not exceed your cash (see msm_get_view).",
  not_enough_shares: "Sell at most the shares you hold (me.shares[slot] in msm_get_view).",
  secret_used: "Each player gets one secret per game.",
  no_pieces: "You have no pieces left.",
  pieces_closed: "Pieces can only be used until round 20.",
  rule_fully_visible: "That rule is already complete; peek at another stock.",
  rate_limited: "Too many calls from this account. Wait a minute before trying again.",
  try_again: "The room did not answer in time. Try again.",
  room_closed: "This room has closed. Create a new one with msm_create_room.",
  not_finished: "The game has not finished yet.",
  bad_target: "Check the player id in msm_get_view (players[].id).",
};

export function errorText(lang: Lang, code: string, params: Params): string {
  const message = say(lang, "err", code, params, []);
  const recovery = RECOVERY[code];
  return `Error (${code}): ${message}${recovery ? ` ${recovery}` : ""}`;
}
