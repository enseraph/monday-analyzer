// Sleek minimalistic SVG line icons for sidebar tabs
// All icons: 14x14, stroke="currentColor" (inherits parent color), strokeWidth=1.5, fill=none
// This means they automatically match active/inactive/dark/light states via CSS color inheritance.

import React from "react";

const I = (props) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  />
);

// ── Daily Report: clipboard with lines ──
export const IconDaily = () => (
  <I>
    <rect x="3" y="1.5" width="8" height="11" rx="1.5" />
    <path d="M5.5 1.5V.5h3v1" />
    <line x1="5.5" y1="5" x2="8.5" y2="5" />
    <line x1="5.5" y1="7.5" x2="8.5" y2="7.5" />
    <line x1="5.5" y1="10" x2="7.5" y2="10" />
  </I>
);

// ── Compare: bidirectional arrows ──
export const IconCompare = () => (
  <I>
    <path d="M1 4.5h12M10 2l3 2.5-3 2.5" />
    <path d="M13 9.5H1M4 7l-3 2.5L4 12" />
  </I>
);

// ── Pace: stopwatch ──
export const IconPace = () => (
  <I>
    <circle cx="7" cy="8" r="5" />
    <line x1="7" y1="8" x2="7" y2="5.5" />
    <line x1="7" y1="8" x2="9" y2="9.5" />
    <line x1="6" y1="1.5" x2="8" y2="1.5" />
    <line x1="7" y1="1.5" x2="7" y2="3" />
  </I>
);

// ── Overview (YYB): ascending bar chart ──
export const IconOverview = () => (
  <I>
    <rect x="1.5" y="7" width="2.5" height="5.5" rx="0.5" />
    <rect x="5.75" y="4" width="2.5" height="8.5" rx="0.5" />
    <rect x="10" y="1.5" width="2.5" height="11" rx="0.5" />
  </I>
);

// ── Kanto vs Kansai: torii gate ──
export const IconKvk = () => (
  <I>
    <line x1="2.5" y1="2" x2="11.5" y2="2" />
    <line x1="1" y1="4.5" x2="13" y2="4.5" />
    <line x1="3.5" y1="2" x2="3.5" y2="13" />
    <line x1="10.5" y1="2" x2="10.5" y2="13" />
    <line x1="3.5" y1="8" x2="10.5" y2="8" />
  </I>
);

// ── Markets / Country Overview: globe ──
export const IconMarkets = () => (
  <I>
    <circle cx="7" cy="7" r="5.5" />
    <ellipse cx="7" cy="7" rx="2.2" ry="5.5" />
    <line x1="1.5" y1="7" x2="12.5" y2="7" />
    <path d="M2.2 4.2Q7 3.5 11.8 4.2" />
    <path d="M2.2 9.8Q7 10.5 11.8 9.8" />
  </I>
);

// ── Segments: pie chart with slices ──
export const IconSegments = () => (
  <I>
    <circle cx="7" cy="7" r="5.5" />
    <path d="M7 1.5V7l3.5 2" />
    <line x1="7" y1="7" x2="3" y2="4.5" />
  </I>
);

// ── Booking Patterns: calendar with dot ──
export const IconBooking = () => (
  <I>
    <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" />
    <line x1="1.5" y1="5.5" x2="12.5" y2="5.5" />
    <line x1="4.5" y1="1" x2="4.5" y2="4" />
    <line x1="9.5" y1="1" x2="9.5" y2="4" />
    <circle cx="7" cy="9" r="1" fill="currentColor" stroke="none" />
  </I>
);

// ── Member: person with badge chevron ──
export const IconMember = () => (
  <I>
    <circle cx="7" cy="4" r="2.5" />
    <path d="M2.5 13c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5" />
    <path d="M10.5 3l1 1-1 1" strokeWidth="1.2" />
  </I>
);

// ── LOS (Length of Stay): crescent moon ──
export const IconLos = () => (
  <I>
    <path d="M10.5 2.5a5 5 0 1 0 0 9 4 4 0 0 1 0-9z" />
  </I>
);

// ── Revenue: yen sign ──
export const IconRevenue = () => (
  <I>
    <path d="M3.5 2l3.5 5 3.5-5" />
    <line x1="3.5" y1="8" x2="10.5" y2="8" />
    <line x1="3.5" y1="10" x2="10.5" y2="10" />
    <line x1="7" y1="7" x2="7" y2="13" />
  </I>
);

// ── Cancellations: circle-X ──
export const IconCancellations = () => (
  <I>
    <circle cx="7" cy="7" r="5.5" />
    <line x1="4.5" y1="4.5" x2="9.5" y2="9.5" />
    <line x1="9.5" y1="4.5" x2="4.5" y2="9.5" />
  </I>
);

// ── Room Types: bed ──
export const IconRooms = () => (
  <I>
    <path d="M1 11.5V5.5a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 13 5.5v6" />
    <line x1="1" y1="11.5" x2="13" y2="11.5" />
    <rect x="1" y="8" width="3" height="2.5" rx="1" />
    <line x1="1" y1="5.5" x2="1" y2="3" />
    <line x1="13" y1="11.5" x2="13" y2="12.5" />
    <line x1="1" y1="11.5" x2="1" y2="12.5" />
  </I>
);

// ── ADR: yen over bed (rate per room night) ──
export const IconAdr = () => (
  <I>
    <path d="M5.5 1.5l1.5 2 1.5-2" />
    <line x1="5" y1="3.5" x2="9" y2="3.5" />
    <line x1="7" y1="2.5" x2="7" y2="5.5" />
    <path d="M1 10V8a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 13 8v2" />
    <line x1="1" y1="10" x2="13" y2="10" />
    <rect x="1.5" y="7.5" width="2.5" height="2" rx="0.8" />
    <line x1="1" y1="10" x2="1" y2="12" />
    <line x1="13" y1="10" x2="13" y2="12" />
  </I>
);

// ── Facilities: building with windows ──
export const IconFacilities = () => (
  <I>
    <rect x="3" y="2" width="8" height="11" rx="1" />
    <rect x="5" y="4.5" width="1.5" height="1.5" rx="0.3" />
    <rect x="7.5" y="4.5" width="1.5" height="1.5" rx="0.3" />
    <rect x="5" y="7.5" width="1.5" height="1.5" rx="0.3" />
    <rect x="7.5" y="7.5" width="1.5" height="1.5" rx="0.3" />
    <rect x="6" y="10.5" width="2" height="2.5" rx="0.3" />
  </I>
);

// ── Hotel Opening: 8-point sparkle ──
export const IconOpening = () => (
  <I>
    <line x1="7" y1="1" x2="7" y2="4" />
    <line x1="7" y1="10" x2="7" y2="13" />
    <line x1="1" y1="7" x2="4" y2="7" />
    <line x1="10" y1="7" x2="13" y2="7" />
    <line x1="2.8" y1="2.8" x2="4.5" y2="4.5" />
    <line x1="9.5" y1="9.5" x2="11.2" y2="11.2" />
    <line x1="11.2" y1="2.8" x2="9.5" y2="4.5" />
    <line x1="4.5" y1="9.5" x2="2.8" y2="11.2" />
  </I>
);

// ── Channel Mix (TL): line chart with dots ──
export const IconChannel = () => (
  <I>
    <path d="M1 13L5 8l3 2.5L13 4" />
    <circle cx="5" cy="8" r="1" fill="currentColor" stroke="none" />
    <circle cx="8" cy="10.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="13" cy="4" r="1" fill="currentColor" stroke="none" />
  </I>
);

// ── TL Overview: trending up line with arrow ──
export const IconTrending = () => (
  <I>
    <polyline points="1,12 4.5,8 7.5,9.5 13,3" />
    <polyline points="9,3 13,3 13,7" />
  </I>
);

// ── Icon mapping keyed by tab concept ──
const TAB_ICONS = {
  daily: <IconDaily />,
  compare: <IconCompare />,
  pace: <IconPace />,
  overview: <IconOverview />,
  kvk: <IconKvk />,
  markets: <IconMarkets />,
  segments: <IconSegments />,
  booking: <IconBooking />,
  member: <IconMember />,
  los: <IconLos />,
  revenue: <IconRevenue />,
  cancellations: <IconCancellations />,
  rooms: <IconRooms />,
  adr: <IconAdr />,
  facilities: <IconFacilities />,
  opening: <IconOpening />,
  channel: <IconChannel />,
  trending: <IconTrending />,
};

export default TAB_ICONS;
