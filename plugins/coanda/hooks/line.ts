// A thin rule as an image: text glyphs make broken lines in the desktop's proportional font.
// The markup is far wider than any band and does not keep its aspect ratio, so with the height
// pinned the surface stretches it to the slot's full width.
export const RULE_HEIGHT = 9

export const ruleSvg = () =>
  '<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="9" viewBox="0 0 4000 9" preserveAspectRatio="none">' +
  '<style>.d{stroke:#1f1e1d;stroke-opacity:.18}@media (prefers-color-scheme:dark){.d{stroke:#fff;stroke-opacity:.22}}</style>' +
  '<line class="d" x1="0" y1="4.5" x2="4000" y2="4.5" vector-effect="non-scaling-stroke"/></svg>'
