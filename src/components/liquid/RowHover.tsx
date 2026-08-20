/* The travelling hover — ONE highlight for a whole list of rows.

   The hover is not painted on the rows. A single pill lives under them and
   GSAP carries it from row to row, going a little gelatinous on the way: it
   squashes flat as it takes off and rings back to shape on the house spring
   once it lands — the pill row's gesture (see PillTabs), turned on its side
   for a vertical list.

   Its shape never changes — four rounded corners, one row's height — and
   neither does its colour: the surface's own neutral tint, whatever the row
   underneath is doing. Colour belongs to the icons. A selected run merges its own wash
   into one long shape; the hover stays the size of the thing the pointer is
   actually on, so "what am I about to click" is never ambiguous.

   Which row is hovered is the host's state; everything else is here, so the
   two dropdowns cannot drift apart. */

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";

import { HOUSE_SPRING_POINTS, springEase } from "./springs";
import { prefersReducedMotion } from "./stretch";
import styles from "./RowHover.module.css";

const SPRING = springEase("liquidRowHoverSpring", HOUSE_SPRING_POINTS);

export interface RowHoverProps {
  /* The row the pointer is on, or null for none. */
  index: number | null;
  rowHeight: number;
  /* The panel's padding: the pill sits inside it, exactly where a row does. */
  inset: number;
}

export function RowHover({ index, rowHeight, inset }: RowHoverProps) {
  const pillRef = useRef<HTMLSpanElement>(null);
  /* Where the pill last was. null means it is dark — the next row it takes
     lights up in place instead of flying in from a stale position. */
  const atRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const pill = pillRef.current;
    if (!pill) {
      return;
    }

    if (index === null) {
      gsap.killTweensOf(pill);
      gsap.to(pill, { autoAlpha: 0, duration: 0.12, ease: "power1.out" });
      atRef.current = null;
      return;
    }

    const y = inset + index * rowHeight;
    const from = atRef.current;
    atRef.current = index;

    gsap.killTweensOf(pill);

    /* Arriving from nowhere, or reduced motion: the pill is simply where it
       belongs. Nothing travels across a list it was not already on. */
    if (from === null || prefersReducedMotion()) {
      gsap.set(pill, { y, scaleX: 1, scaleY: 1 });
      gsap.to(pill, { autoAlpha: 1, duration: 0.1, ease: "power1.out" });
      return;
    }

    /* The travel answers the pointer, it does not chase it: an OUT ease from
       the first frame (an in-out's soft start read as lag), most of the
       distance covered in the first hundred milliseconds, and the jelly
       recovery overlapping the tail of the ride instead of waiting for it. */
    gsap
      .timeline()
      .to(pill, { y, duration: 0.19, ease: "power3.out" }, 0)
      /* Flat and a touch wide mid-flight — mass thrown along the travel. */
      .to(pill, { scaleY: 0.82, scaleX: 1.02, duration: 0.08, ease: "power2.out" }, 0)
      .to(pill, { scaleY: 1, scaleX: 1, duration: 0.4, ease: SPRING }, 0.09);
  }, [index, inset, rowHeight]);

  return (
    <span
      ref={pillRef}
      className={styles.pill}
      aria-hidden="true"
      style={{ height: rowHeight, left: inset, right: inset }}
    />
  );
}
