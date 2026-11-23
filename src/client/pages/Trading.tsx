import { useEffect, useState } from "react";
import { NUM_STOCKS, PIECES_LAST_ROUND, PIECE_CASH, START_PIECES, MAX_ORDER } from "../../engine/constants";
import type { ClientMsg, FeedEventView, MeView, StockView, View } from "../../shared/protocol";
import { CompanyLogo } from "../components/CompanyLogo";
import { IconCash, IconCheck, IconPeek, IconRules, IconSecret, IconSettings, IconSliders } from "../components/icons";
import { LogoMark } from "../components/Logo";
import { RuleText } from "../components/RuleText";
import { Sparkline } from "../components/Sparkline";
import { Delta, formatClock, Pips, PriceTag, Sheet, useTween } from "../components/common";
import { useI18n } from "../i18n";
import { load, nextSeq, save } from "../storage";
import { useRemaining, type Settled } from "../useRoom";

type Send = (m: ClientMsg) => boolean;

export const RULES_ID = "rules";

function jumpToRules(): void {
  const el = document.getElementById(RULES_ID);
  if (!el) return;
  // Instant jump: smooth scrolling gets cut short by the live re-renders (clock ticks).
  const top = el.getBoundingClientRect().top + window.scrollY - 68; // clear the sticky top bar
  window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
  el.focus({ preventScroll: true });
}

export function GameBar({
  view,
  offset,
  onHost,
  onMenu,
  onReady,
}: {
  view: View;
  offset: number;
  onHost?: () => void;
  onMenu: () => void;
  onReady: (value: boolean) => void;
}) {
  const { t } = useI18n();
  // When everyone is ready the clock counts down the settling seconds instead of the round deadline.
  const left = useRemaining(view.phase === "trading" ? (view.earlyEndAt ?? view.deadline) : null, offset);
  const me = view.me;
  const canReady = !!me && !me.frozen && (view.phase === "trading" || view.phase === "paused");
  return (
    <div className="gamebar">
      <div className="container gamebar-inner room-width">
        <LogoMark shape={view.logo} />
        <div className="round num" aria-label={t("game.roundOf", { r: view.round, n: view.totalRounds })}>
          {String(view.round).padStart(2, "0")}/{view.totalRounds}
        </div>
        <div
          className={`clock${left !== null && left < 10_000 ? " low" : ""}`}
          aria-live="off"
          title={view.config.roundSeconds === 0 ? t("game.noLimitHint") : undefined}
        >
          {view.phase === "paused" ? (
            t("game.paused")
          ) : left !== null ? (
            formatClock(left)
          ) : view.config.roundSeconds === 0 ? (
            <span style={{ fontSize: "1.4em", lineHeight: 1 }}>∞</span>
          ) : (
            "–:––"
          )}
        </div>
        <div className="grow" />
        {/* Jumps to the Rules card at the bottom; also shows when the next words are revealed. */}
        <button
          className="btn btn-sm"
          onClick={jumpToRules}
          aria-label={t("game.rules")}
          title={view.nextReveal !== null ? t("game.nextRevealHint") : t("game.rules")}
        >
          <IconRules size={16} />
          <span className="reveal-long">{t("game.rules")}</span>
          {view.nextReveal !== null && <span className="chip chip-sm chip-warning">R{view.nextReveal}</span>}
        </button>
        {canReady && (
          // Phones only; PCs get the big Ready button above the account card.
          <button
            className={`btn btn-sm btn-ready hide-wide${me.ready ? " is-ready" : ""}`}
            aria-pressed={me.ready}
            disabled={view.phase !== "trading"}
            onClick={() => onReady(!me.ready)}
          >
            {me.ready && <IconCheck size={16} />}
            {t("game.ready")}
          </button>
        )}
        {onHost ? (
          // Host: one menu button; the host sheet links to the display settings.
          <button className="btn btn-sm icon-btn" onClick={onHost} aria-label={t("host.menu")} title={t("host.menu")}>
            <IconSliders />
          </button>
        ) : (
          <button
            className="btn btn-ghost btn-sm icon-btn"
            onClick={onMenu}
            aria-label={t("common.settings")}
            title={t("common.settings")}
          >
            <IconSettings />
          </button>
        )}
      </div>
    </div>
  );
}

const WIDE_QUERY = "(min-width: 1024px)";

/** True on PC-width screens (matches the CSS breakpoint for the wide layout). */
function useWide(): boolean {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(WIDE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(WIDE_QUERY);
    if (!mq) return;
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

function StockCard({
  i,
  s,
  view,
  me,
  send,
  flash,
}: {
  i: number;
  s: StockView;
  view: View;
  me: MeView | null;
  send: Send;
  flash: boolean;
}) {
  const { t, money, num, stock } = useI18n();
  const openKey = `msm:open:${view.code}`;
  const wide = useWide();
  // Phones: collapsible, remembered per room (closed by default). PCs: always open.
  const [open, setOpen] = useState<boolean>(() => load<number[]>(openKey, []).includes(i));
  const shown = wide || open;
  const [qty, setQty] = useState(1);
  const noteKey = `msm:notes:${view.code}:${view.gameNo}:${i}`;
  const [note, setNote] = useState(() => load<string>(noteKey, ""));
  const held = me?.shares[i] ?? 0;
  const canTrade = !!me && !me.frozen && view.phase === "trading";
  const maxBuy = me && me.cash !== null && s.price !== null ? Math.floor(me.cash / s.price) : null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    const set = new Set(load<number[]>(openKey, []));
    if (next) set.add(i);
    else set.delete(i);
    save(openKey, [...set]);
  };
  const trade = (side: "buy" | "sell") => {
    const q = Math.max(1, Math.min(MAX_ORDER, Math.floor(qty)));
    send({ type: "trade", stock: i, side, qty: q, seq: nextSeq(view.code) });
  };

  return (
    <div className={`card stock${flash ? " stock-flash" : ""}`}>
      {/* PCs: every card is always open, so cards line up at the same size. */}
      <button
        className="stock-head"
        onClick={wide ? undefined : toggle}
        disabled={wide}
        aria-expanded={shown}
        data-stock={i}
      >
        <CompanyLogo i={i} size={40} />
        <div className="grow stack-sm" style={{ gap: 4 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="stock-name">{stock(i)}</span>
            {s.hidden && <span className="chip chip-sm chip-warning">{t("stock.hidden")}</span>}
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div style={{ width: 96 }}>
              <Sparkline points={s.chart} width={96} height={22} totalRounds={view.totalRounds} />
            </div>
            {held > 0 && <span className="chip chip-sm">{t("stock.youHold", { n: num(held) })}</span>}
          </div>
        </div>
        <PriceTag price={s.price} delta={s.delta} />
      </button>
      {shown && (
        <div className="stock-body">
          <Sparkline points={s.chart} width={320} height={64} totalRounds={view.totalRounds} />
          <div className="stats">
            <span>{t("stock.lastRound")}</span>
            {s.last ? (
              <>
                <span>
                  {t("stock.buyVol")} <b>{num(s.last.buy)}</b>
                </span>
                <span>
                  {t("stock.sellVol")} <b>{num(s.last.sell)}</b>
                </span>
                <span>
                  {t("stock.holdings")} <b>{num(s.last.hold)}</b>
                </span>
              </>
            ) : (
              <span className="unknown">{s.lastHidden ? "???" : "—"}</span>
            )}
          </div>
          {me && (
            <div className="row-between small">
              <span className="muted">{t("stock.position", { n: num(held) })}</span>
              <span className="num">{s.price === null ? "???" : money(held * s.price)}</span>
            </div>
          )}
          {me && (
            <div className="stack-sm">
              <div className="trade-row">
                <button
                  className="btn btn-sm"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={!canTrade}
                  aria-label="−1"
                >
                  −
                </button>
                <input
                  className="input qty"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_ORDER}
                  value={qty}
                  aria-label={t("stock.qty")}
                  onChange={(e) => setQty(Math.max(1, Math.min(MAX_ORDER, Number(e.target.value) || 1)))}
                />
                <button
                  className="btn btn-sm"
                  onClick={() => setQty((q) => Math.min(MAX_ORDER, q + 1))}
                  disabled={!canTrade}
                  aria-label="+1"
                >
                  +
                </button>
                <button
                  className="btn btn-sm"
                  disabled={!canTrade || !maxBuy}
                  onClick={() => maxBuy && setQty(maxBuy)}
                  title={maxBuy === null ? t("stock.maxUnknown") : undefined}
                >
                  {t("stock.max")}
                </button>
                <button
                  className="btn btn-sm"
                  disabled={!canTrade || held === 0}
                  onClick={() => setQty(Math.max(1, held))}
                >
                  {t("stock.all")}
                </button>
              </div>
              <div className="trade-go">
                <button className="btn btn-primary" disabled={!canTrade} onClick={() => trade("buy")}>
                  {t("stock.buy")}
                </button>
                <button className="btn" disabled={!canTrade || held === 0} onClick={() => trade("sell")}>
                  {t("stock.sell")}
                </button>
              </div>
            </div>
          )}
          <label className="field">
            {t("stock.notes")}
            <textarea
              className="input"
              rows={2}
              value={note}
              placeholder={t("stock.notesPlaceholder")}
              onChange={(e) => {
                setNote(e.target.value);
                save(noteKey, e.target.value || null);
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}

function StockPicker({
  title,
  open,
  onClose,
  onPick,
  disabled,
  hint,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  onPick: (i: number) => void;
  disabled?: (i: number) => boolean;
  hint?: string;
}) {
  const { stock } = useI18n();
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {hint && (
        <p className="small muted" style={{ marginTop: 0 }}>
          {hint}
        </p>
      )}
      <div className="stack-sm">
        {Array.from({ length: NUM_STOCKS }, (_, i) => (
          <button
            key={i}
            className="btn btn-block"
            style={{ justifyContent: "flex-start", height: 48, gap: 12 }}
            disabled={disabled?.(i)}
            onClick={() => {
              onPick(i);
              onClose();
            }}
          >
            <CompanyLogo i={i} size={30} />
            {stock(i)}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function Desk({ view, me, send }: { view: View; me: MeView; send: Send }) {
  const { t, money, stock } = useI18n();
  const [pick, setPick] = useState<"secret" | "peek" | null>(null);
  const [confirmSecret, setConfirmSecret] = useState<number | null>(null);
  const [confirmCash, setConfirmCash] = useState(false);
  // Cash and net worth animate to new values like stock prices.
  const cashShown = useTween(me.cash, 1000); // changes on every trade: keep it snappy
  const netShown = useTween(me.net);
  const piecesOpen = view.round <= PIECES_LAST_ROUND && view.phase === "trading" && !me.frozen;
  const active = view.phase === "trading" && !me.frozen;
  return (
    <div className="card card-pad stack">
      <div className="row-between">
        <h3>{t("desk.title")}</h3>
        {me.frozen && <span className="chip chip-error">{t("desk.frozen")}</span>}
      </div>
      {me.blind && <div className="banner">{t("desk.blind")}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="stack-sm" style={{ gap: 2 }} title={t("desk.cashDeltaHint")}>
          <span className="overline">{t("desk.cash")}</span>
          <span className="price" style={{ textAlign: "left" }}>
            {me.cash === null ? "???" : money(cashShown ?? me.cash)}
          </span>
          {me.cash === null ? <div className="delta unknown">???</div> : <Delta value={me.cashDelta} align="left" />}
        </div>
        <div className="stack-sm" style={{ gap: 2 }} title={t("desk.netDeltaHint")}>
          <span className="overline">{t("desk.net")}</span>
          <span className="price" style={{ textAlign: "left" }}>
            {me.net === null ? "???" : money(netShown ?? me.net)}
          </span>
          {me.net === null ? <div className="delta unknown">???</div> : <Delta value={me.netDelta} align="left" />}
        </div>
        <div className="stack-sm" style={{ gap: 6 }}>
          <span className="overline">{t("desk.pieces")}</span>
          <Pips n={me.pieces} of={START_PIECES} />
        </div>
        <div className="stack-sm" style={{ gap: 2 }}>
          <span className="overline">{t("desk.secret")}</span>
          <span className="small">
            {me.secretStock === null
              ? t("desk.secretUnused")
              : t("desk.secretUsed", { stock: stock(me.secretStock), r: me.secretRound ?? 0 })}
          </span>
        </div>
      </div>
      <div className="row wrap">
        <button className="btn btn-sm" disabled={!active || me.secretStock !== null} onClick={() => setPick("secret")}>
          <IconSecret size={16} color="var(--ic-secret)" />
          {t("desk.placeSecret")}
        </button>
        <button className="btn btn-sm" disabled={!piecesOpen || me.pieces === 0} onClick={() => setPick("peek")}>
          <IconPeek size={16} color="var(--ic-peek)" />
          {t("desk.peek")}
        </button>
        <button className="btn btn-sm" disabled={!piecesOpen || me.pieces === 0} onClick={() => setConfirmCash(true)}>
          <IconCash size={16} color="var(--ic-cash)" />
          {t("desk.cashIn", { amount: money(PIECE_CASH) })}
        </button>
      </div>
      {view.round > PIECES_LAST_ROUND && <span className="caption">{t("desk.piecesClosed")}</span>}

      <StockPicker
        title={t("desk.placeSecret")}
        hint={t("desk.secretHint")}
        open={pick === "secret"}
        onClose={() => setPick(null)}
        onPick={(i) => setConfirmSecret(i)}
      />
      <StockPicker
        title={t("desk.peek")}
        hint={t("desk.peekHint")}
        open={pick === "peek"}
        onClose={() => setPick(null)}
        onPick={(i) => send({ type: "usePiece", kind: "peek", stock: i })}
        disabled={(i) => (view.stocks[i]?.level ?? 0) >= 4}
      />
      <Sheet open={confirmCash} onClose={() => setConfirmCash(false)} title={t("desk.cashTitle")}>
        <p style={{ marginTop: 0 }}>{t("desk.cashConfirm", { n: me.pieces, amount: money(PIECE_CASH) })}</p>
        <div className="row" style={{ marginBottom: 16 }}>
          <Pips n={me.pieces} of={START_PIECES} />
          <span className="small muted">→</span>
          <Pips n={Math.max(0, me.pieces - 1)} of={START_PIECES} />
        </div>
        <div className="row">
          <button
            className="btn btn-primary"
            disabled={!piecesOpen || me.pieces === 0}
            onClick={() => {
              send({ type: "usePiece", kind: "cash" });
              setConfirmCash(false);
            }}
          >
            <IconCash size={16} />
            {t("desk.cashGo", { amount: money(PIECE_CASH) })}
          </button>
          <button className="btn" onClick={() => setConfirmCash(false)}>
            {t("common.cancel")}
          </button>
        </div>
      </Sheet>
      <Sheet open={confirmSecret !== null} onClose={() => setConfirmSecret(null)} title={t("desk.placeSecret")}>
        <p style={{ marginTop: 0 }}>
          {t("desk.secretConfirm", {
            stock: confirmSecret === null ? "" : stock(confirmSecret),
            from: view.round + 1,
            to: view.round + 2,
          })}
        </p>
        <div className="row">
          <button
            className="btn btn-primary"
            onClick={() => {
              if (confirmSecret !== null) send({ type: "placeSecret", stock: confirmSecret });
              setConfirmSecret(null);
            }}
          >
            {t("desk.secretGo")}
          </button>
          <button className="btn" onClick={() => setConfirmSecret(null)}>
            {t("common.cancel")}
          </button>
        </div>
      </Sheet>
    </div>
  );
}

export function Standings({ view, big = false }: { view: View; big?: boolean }) {
  const { t, money } = useI18n();
  return (
    <div className="divided">
      {view.standings.map((s) => (
        <div className="list-row" key={s.id} style={big ? { padding: "0.6vh 1vw" } : undefined}>
          <div className="row grow" style={{ minWidth: 0 }}>
            <span className="num muted" style={{ width: 22 }}>
              {s.rank}
            </span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
            {s.me && <span className="badge">{t("common.you")}</span>}
            {s.bot && <span className="badge">{t("common.bot")}</span>}
            {s.frozen && <span className="badge">{t("common.frozen")}</span>}
            {!s.bot && s.ready && <span className="chip chip-sm chip-success">{t("game.readyMark")}</span>}
            {!s.bot && !s.connected && <span className="dot" title={t("lobby.offline")} />}
          </div>
          <span className="num">{s.net === null ? "???" : money(s.net, { compact: true })}</span>
        </div>
      ))}
    </div>
  );
}

export function Feed({ events }: { events: FeedEventView[] }) {
  const { code, t } = useI18n();
  const list = events.slice(-12).reverse();
  if (list.length === 0)
    return (
      <p className="small muted" style={{ margin: 0, padding: "12px 16px" }}>
        {t("feed.empty")}
      </p>
    );
  return (
    <div className="divided">
      {list.map((e) => (
        <div className="list-row small" key={e.id}>
          <span>{code("ev", e.code, e.params)}</span>
          {e.round !== null && <span className="caption num">R{e.round}</span>}
        </div>
      ))}
    </div>
  );
}

export function Trading({
  view,
  send,
  settled,
  offset,
}: {
  view: View;
  send: Send;
  settled: Settled | null;
  offset: number;
}) {
  const { t } = useI18n();
  const me = view.me;
  const [flash, setFlash] = useState(false);
  const earlyLeft = useRemaining(view.earlyEndAt, offset);

  useEffect(() => {
    if (!settled) return;
    setFlash(true);
    const id = setTimeout(() => setFlash(false), 1000);
    return () => clearTimeout(id);
  }, [settled]);

  // Phones: one column (banners, desk, stocks, standings, feed).
  // PCs: stocks fill the screen in a grid; desk, standings and feed form a sidebar.
  return (
    <div className="trading-layout">
      <div className="area-banners stack-sm">
        {view.phase === "paused" && <div className="banner">{t("game.pausedBanner")}</div>}
        {view.earlyEndAt !== null && (
          <div className="banner row-between">
            <span>{t("game.settlingIn", { s: Math.ceil((earlyLeft ?? 0) / 1000) })}</span>
            {me?.ready && (
              <button className="btn btn-sm" onClick={() => send({ type: "ready", value: false })}>
                {t("common.cancel")}
              </button>
            )}
          </div>
        )}
        {view.anySecret && <div className="banner">{t("game.secretActive")}</div>}
        {!me && <div className="banner">{t("game.watching")}</div>}
      </div>
      {me && (
        <div className="area-desk">
          <Desk view={view} me={me} send={send} />
        </div>
      )}
      {me && !me.frozen && (
        <div className="area-ready">
          <BigReady view={view} ready={me.ready} onReady={(value) => send({ type: "ready", value })} offset={offset} />
        </div>
      )}
      <div className="area-stocks stock-grid">
        {view.stocks.map((s, i) => (
          <StockCard key={i} i={i} s={s} view={view} me={me} send={send} flash={flash && s.delta !== null} />
        ))}
      </div>
      <div className="card area-standings">
        <div className="card-pad row-between" style={{ paddingBottom: 8 }}>
          <h3>{t("game.standings")}</h3>
          <span className="chip">{t("game.readyCount", { n: view.ready.count, total: view.ready.total })}</span>
        </div>
        <Standings view={view} />
      </div>
      <div className="card area-feed">
        <div className="card-pad" style={{ paddingBottom: 8 }}>
          <h3>{t("feed.title")}</h3>
        </div>
        <Feed events={view.events} />
      </div>
      <RulesCard view={view} />
    </div>
  );
}

/**
 * PC: the big "end my turn" button. Indigo while you're still trading (the call to action);
 * green with a check once you're ready, showing who you're waiting for. Click again to undo.
 */
function BigReady({
  view,
  ready,
  onReady,
  offset,
}: {
  view: View;
  ready: boolean;
  onReady: (value: boolean) => void;
  offset: number;
}) {
  const { t } = useI18n();
  const settling = useRemaining(view.earlyEndAt, offset);
  const endsRound = view.config.endEarly || view.config.roundSeconds === 0;
  const caption =
    view.earlyEndAt !== null
      ? t("game.settlingIn", { s: Math.ceil((settling ?? 0) / 1000) })
      : ready
        ? t("game.readyWaiting", { n: view.ready.count, total: view.ready.total })
        : endsRound
          ? t("game.readyHintEnds")
          : t("game.readyHintTimer");
  return (
    <button
      className={`btn btn-ready ready-big${ready ? " is-ready" : ""}`}
      aria-pressed={ready}
      disabled={view.phase !== "trading"}
      onClick={() => onReady(!ready)}
    >
      <span className="row" style={{ gap: 8 }}>
        {ready && <IconCheck size={20} />}
        {ready ? t("game.readyDone") : t("game.readyBig")}
      </span>
      <span className="ready-caption">{caption}</span>
    </button>
  );
}

/** Every company's rule, one line each, at the bottom of the page. */
function RulesCard({ view }: { view: View }) {
  const { t, stock } = useI18n();
  return (
    <section id={RULES_ID} className="card area-rules" tabIndex={-1} aria-labelledby="rules-heading">
      <div className="card-pad row-between wrap" style={{ paddingBottom: 8 }}>
        <h3 id="rules-heading">{t("game.rules")}</h3>
        {view.nextReveal !== null && (
          <span className="chip chip-warning">{t("game.revealAt", { r: view.nextReveal })}</span>
        )}
      </div>
      <p className="caption" style={{ margin: 0, padding: "0 16px 8px" }}>
        {t("game.rulesHint")}
      </p>
      <div className="divided rules-list">
        {view.stocks.map((s, i) => (
          <div key={i} className="rule-row">
            <div className="row" style={{ gap: 10, minWidth: 0 }}>
              <CompanyLogo i={i} size={30} />
              <span className="stock-name">{stock(i)}</span>
            </div>
            <RuleText tokens={s.rule} publicLevel={view.revealLevel} />
          </div>
        ))}
      </div>
    </section>
  );
}
