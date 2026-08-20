/* The one motion question every component in here asks: may I move at all?

   ONE implementation — it was four, copied byte for byte into the switch, the
   checkbox, the radio and the pill row, while the liquid surfaces asked the
   grab engine for it. A component reaching into the grab engine for a media
   query was the tell that this belonged somewhere of its own. */

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
