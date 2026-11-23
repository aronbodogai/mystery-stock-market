import { useEffect, useRef, useState } from "react";
import type { RuleToken } from "../../shared/protocol";
import type { Lang } from "../../shared/lang";
import { useI18n } from "../i18n";

/**
 * A rule as tokens. Hidden tokens render as redaction bars sized to the hidden
 * text's length in the viewer's language. The next group to be revealed is
 * striped; freshly revealed words get a short highlight.
 */
export function RuleText({
  tokens,
  publicLevel,
  className = "rule",
}: {
  tokens: readonly RuleToken[];
  /** Round-based public reveal level (peeked groups above it are marked). */
  publicLevel: number;
  className?: string;
}) {
  const { lang, t } = useI18n();
  const seen = useRef<Set<number> | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(new Set());

  // Track which token indices just became visible.
  useEffect(() => {
    const visible = new Set<number>();
    tokens.forEach((tok, i) => {
      if ("text" in tok) visible.add(i);
    });
    if (seen.current) {
      const prev = seen.current;
      const newly = new Set([...visible].filter((i) => !prev.has(i)));
      if (newly.size) {
        setFresh(newly);
        const id = setTimeout(() => setFresh(new Set()), 4000);
        seen.current = visible;
        return () => clearTimeout(id);
      }
    }
    seen.current = visible;
  }, [tokens]);

  const hiddenGroups = tokens.filter((x) => !("text" in x)).map((x) => x.g);
  const nextGroup = hiddenGroups.length ? Math.min(...hiddenGroups) : null;

  return (
    <p className={className} style={{ margin: 0 }}>
      {tokens.map((tok, i) =>
        "text" in tok ? (
          <span
            key={i}
            className={`tok${fresh.has(i) ? " fresh" : ""}${tok.g > publicLevel ? " peeked" : ""}`}
            title={tok.g > publicLevel ? t("rule.peeked") : undefined}
          >
            {tok.text}
          </span>
        ) : (
          <span
            key={i}
            className={`redact${tok.g === nextGroup ? " next" : ""}`}
            style={{ width: barWidth(tok.len, lang) }}
            title={tok.g === nextGroup ? t("rule.nextReveal") : t("rule.hidden")}
            aria-label={t("rule.hidden")}
          />
        ),
      )}
    </p>
  );
}

function barWidth(len: number, lang: Lang): string {
  // Hangul syllables are roughly full-width; Latin letters about half an em.
  return lang === "ko" ? `${(len * 0.92).toFixed(2)}em` : `${(len * 0.52).toFixed(2)}em`;
}
