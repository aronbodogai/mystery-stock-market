import type { ReactNode } from "react";

/** UI icons: 24×24 line glyphs in currentColor, same stroke language as the company marks. */
function Icon({ children, size = 18, color }: { children: ReactNode; size?: number; color?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flex: "none", ...(color ? { color } : {}) }}
    >
      {children}
    </svg>
  );
}

/** `color`: optional semantic colour (e.g. var(--ic-secret)); defaults to the text colour. */
type P = { size?: number; color?: string };

/** Host controls: three sliders. */
export const IconSliders = (p: P) => (
  <Icon {...p}>
    <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="12" r="2" />
    <circle cx="17" cy="17" r="2" />
  </Icon>
);

/** Settings: a cog. */
export const IconSettings = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6" />
  </Icon>
);

/** Secret: an eye with a slash. */
export const IconSecret = (p: P) => (
  <Icon {...p}>
    <path d="M3 12s3.3-6 9-6c1.6 0 3 .5 4.2 1.1M21 12s-3.3 6-9 6c-1.6 0-3-.5-4.2-1.1" />
    <path d="M9.9 14.1a3 3 0 0 0 4.2-4.2" />
    <path d="M4 20 20 4" />
  </Icon>
);

/** Peek: an open eye. */
export const IconPeek = (p: P) => (
  <Icon {...p}>
    <path d="M3 12s3.3-6 9-6 9 6 9 6-3.3 6-9 6-9-6-9-6Z" />
    <circle cx="12" cy="12" r="2.8" />
  </Icon>
);

/** Cash in a piece: a coin with a plus. */
export const IconCash = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 8.5v7M8.5 12h7" />
  </Icon>
);

/** TV. */
export const IconTv = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="12" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </Icon>
);

/** Rules: a list with bullet lines. */
export const IconRules = (p: P) => (
  <Icon {...p}>
    <path d="M9 6.5h11M9 12h11M9 17.5h11" />
    <circle cx="4.8" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="4.8" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="4.8" cy="17.5" r="1.1" fill="currentColor" stroke="none" />
  </Icon>
);

/** Ready: a check mark. */
export const IconCheck = (p: P) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);
