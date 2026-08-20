/* The icon morph — the glyph spins itself away, the tick SNAPS up out of it.

   Two beats, nothing in between:

   — OUT: the glyph turns as it collapses — a twist gathering speed into a
     hard scale-down, like something wrung out of sight — and is gone at the
     bottom of the dive.
   — IN: the instant it vanishes, the tick GROWS from that same point on the
     family's pop spring — past full size, a dip, a settle — swinging upright
     from a small counter-tilt, so the growth carries the spin's momentum
     back out.

   Deselecting is the SAME choreography played backwards — one timeline,
   play() and reverse() — which is also what makes a mid-flight toggle
   correct for free: the ride simply turns around wherever it is, no jump,
   no rebuild.

   ONE implementation for every dropdown, same contract as the rest of
   liquid/: the host only says which shape and whether it is ticked. */

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";

import { ICON_PATHS } from "../LiquidMenu/icons";
import { POP_SPRING_POINTS, springEase } from "./springs";
import { prefersReducedMotion } from "./stretch";

const POP = springEase("liquidIconPop", POP_SPRING_POINTS);

export interface IconMorphProps {
  /* The resting glyph's 24-box d (one of ICON_PATHS). */
  shape: string;
  checked: boolean;
  className?: string;
}

export function IconMorph({ shape, checked, className }: IconMorphProps) {
  const shapeRef = useRef<SVGPathElement>(null);
  const checkRef = useRef<SVGPathElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  /* The first checked-effect run only PLACES the timeline — a row must never
     animate just because it mounted already ticked. */
  const mountedRef = useRef(false);
  /* checked, readable from the build effect without re-triggering it. */
  const checkedRef = useRef(checked);
  checkedRef.current = checked;

  useLayoutEffect(() => {
    const shapeEl = shapeRef.current;
    const checkEl = checkRef.current;
    if (!shapeEl || !checkEl) {
      return;
    }

    /* The FULL base state, not just the origins: a rebuild (hot reload, a
       shape swap) lands on DOM nodes that may still wear a dead timeline's
       inline styles — a glyph parked at alpha 0 by a killed ride stays
       invisible forever unless the new build explicitly reclaims every
       property it is about to animate. */
    gsap.set(shapeEl, { transformOrigin: "50% 50%", autoAlpha: 1, scale: 1, rotation: 0 });
    gsap.set(checkEl, { transformOrigin: "50% 50%", autoAlpha: 0, scale: 1, rotation: 0 });

    const tl = gsap.timeline({ paused: true });

    /* OUT — the glyph wrings itself away: the turn and the shrink share one
       accelerating curve, so it reads as a single twist into nothing. */
    tl.to(shapeEl, { rotation: 150, scale: 0.04, duration: 0.2, ease: "power2.in" }, 0);
    tl.set(shapeEl, { autoAlpha: 0 }, 0.19);

    /* IN — and SUDDENLY the tick, growing out of the same point on the pop
       spring: past full size, a dip, a settle. The counter-tilt unwinds as
       it grows, carrying the collapse's spin back out. */
    tl.set(checkEl, { autoAlpha: 1 }, 0.2);
    tl.fromTo(
      checkEl,
      { scale: 0.05, rotation: -75 },
      { scale: 1, rotation: 0, duration: 0.5, ease: POP },
      0.2,
    );

    /* Placed straight onto the current state — a rebuild must never leave a
       ticked row showing its glyph until the next click. */
    tl.progress(checkedRef.current ? 1 : 0).pause();

    tlRef.current = tl;
    return () => {
      tl.kill();
      tlRef.current = null;
    };
    /* Rebuilt only if the glyph itself changes. */
  }, [shape]);

  useLayoutEffect(() => {
    const tl = tlRef.current;
    if (!tl) {
      return;
    }
    if (!mountedRef.current || prefersReducedMotion()) {
      mountedRef.current = true;
      tl.progress(checked ? 1 : 0).pause();
      return;
    }
    if (checked) {
      tl.timeScale(1).play();
    } else {
      /* The way back is the same ride reversed, a shade brisker — undoing
         should feel lighter than doing. */
      tl.timeScale(1.35).reverse();
    }
  }, [checked]);

  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        ref={shapeRef}
        d={shape}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        ref={checkRef}
        d={ICON_PATHS.check}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
