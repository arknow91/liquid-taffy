/* The multi-select wash — where neighbouring selections become ONE shape.

   The wash is a flat, NEUTRAL tint (the surface's own hover grey, painted by
   the host's CSS) — colour lives only in the icons. What this module owns is
   the GEOMETRY of merging: two selected neighbours do not wear two shapes —
   the radii between them collapse and the tints touch, one rounded run
   however many rows long. ONE implementation for every dropdown.

   Radii land in border-radius — interpolable — so joining and splitting
   breathe on the host's transitions instead of snapping. */

import type { CSSProperties } from "react";

const ROW_RADIUS = "9px";

export type RowSelectionStyle = CSSProperties & Record<`--${string}`, string>;

/* The custom properties one row's selection shape is drawn from. `hues` are
   the rows' RESOLVED motif hues on the current frame — worn ONLY by the icon
   (its hover neon and its tick), never by the wash. A null hue is the light
   frame saying "no motif here": the variable is simply left unset and the
   glyph keeps the row's own ink. */
export function rowSelectionStyle(
  selected: readonly boolean[],
  index: number,
  hues: readonly (string | null)[],
): RowSelectionStyle {
  const hue = hues[index];
  const style: RowSelectionStyle = hue === null ? {} : { "--row-hue": hue };

  if (!selected[index]) {
    /* Standalone-round while dark: on selection the radii animate into the
       run — the join IS the morph. */
    style["--sel-radius-top"] = ROW_RADIUS;
    style["--sel-radius-bottom"] = ROW_RADIUS;
    return style;
  }

  const above = index > 0 && selected[index - 1];
  const below = index < selected.length - 1 && selected[index + 1];

  /* Radii collapse only at edges shared with a selected neighbour, so the
     run reads as one rounded shape. */
  style["--sel-radius-top"] = above ? "0px" : ROW_RADIUS;
  style["--sel-radius-bottom"] = below ? "0px" : ROW_RADIUS;

  return style;
}
