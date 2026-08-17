/* The grab — the family's shared gesture, ONE implementation.

   Press any liquid body and drag: a chain of beads is drawn out of its rim as
   a liquid finger, the grabbed body leans after it, and the release whips it
   all home on the house spring. LiquidMenu (the speed dial) is the reference
   implementation this engine was lifted from, verbatim — LiquidAdd and
   LiquidMorph run the exact same object, so the stretch cannot drift apart
   between components again.

   The engine owns the gesture: the math, the tweens, the release choreography
   and the press/click bookkeeping. Each component remains the owner of its own
   goo — blur, thresholds, alphas, the crisp-picture handoff — and hands those
   over as StretchHost callbacks. The engine decides WHEN; the host knows HOW. */

import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";

import { HOUSE_SPRING_POINTS, springEase } from "./springs";

gsap.registerPlugin(CustomEase);

const SPRING = springEase("liquidStretchSpring", HOUSE_SPRING_POINTS);
const OUT_STRONG = CustomEase.create("liquidStretchOutStrong", "0.23,1,0.32,1");

/* How far (from the grabbed element's center) the piece of edge can be pulled
   before the sponge stops giving. */
export const GRAB_MAX = 44;

/* Four beads shaped like a real liquid finger: THICK at the root so it melts
   into the body it is pulled from, THINNEST through the middle (the neck),
   and a modest bulb at the head. `thin` is how much each bead narrows at full
   tension — the neck necks down as the finger extends, the head keeps its
   mass. `lag` grows down the chain so the beads trail the head and keep the
   goo bridge unbroken all the way out. */
export const GRAB_CHAIN = [
  { follow: 1, size: 0.85, thin: 0.06, lag: 0.16 },
  { follow: 0.76, size: 0.62, thin: 0.2, lag: 0.19 },
  { follow: 0.52, size: 0.66, thin: 0.18, lag: 0.22 },
  { follow: 0.28, size: 0.82, thin: 0.1, lag: 0.25 },
] as const;

/* The held blob (and its chain) wears the hover tint — rgb(0 0 0 / 4.5%) over
   white, flattened. Fills ride the blur through the goo filter, so where a
   tinted finger touches a white drop the two colors blend into a gradient. */
export const LIQUID_FILL_HOVER = "#f3f3f3";

/* "trigger" is the plus button; a number names one of the host's aux bodies —
   a satellite for the speed dial, the panel for the dropdowns. */
export type StretchTarget = "trigger" | number;

type Tweenable = Element | null;

/* The slice of a pointer event the engine needs — React's synthetic event
   satisfies it structurally, so the engine stays framework-free. */
export interface StretchPointerEvent {
  button: number;
  pointerId: number;
  clientX: number;
  clientY: number;
  currentTarget: { setPointerCapture(pointerId: number): void };
}

export interface StretchHost {
  buttonSize: number;
  /* How far the pulled aux body leans after the finger — 0.22 for the speed
     dial's drops, 0.14 for the heavier dropdown panels. (The trigger's lean
     is the engine's own: 0.18 for the circle, 0.28 for the icon.) */
  auxLean: number;
  anchor(): HTMLElement | null;
  /* Blob + bordered body + icon — everything that squashes together, or the
     button visually tears apart. */
  triggerBits(): Tweenable[];
  /* Blob + bordered body only: they additionally wear the rotated directional
     stretch (rotation is invisible on a circle — it only orients the scale),
     while the icon must not rotate with them. */
  triggerStretchBits(): Tweenable[];
  triggerIcon(): Tweenable;
  chain(): (SVGCircleElement | null)[];
  /* The blobs that wear the hover tint while this target is held. */
  grabbedBlobs(target: StretchTarget): (SVGElement | null)[];
  /* The pulled aux body's trio (goo blob, crisp body, hit area). */
  auxTrio(index: number): Tweenable[];
  /* Show the goo at the grab blur: alphas re-armed, thresholds matched,
     data-liquid set. Also the host's chance to HIDE any blob parked inside
     the trigger (a shrunk dropdown panel) — a hidden mass that stays put
     while the grabbed circle leans away pokes out of the silhouette as a
     hump, which is exactly the deformation this engine exists to avoid. */
  liquidOn(target: StretchTarget): void;
  /* Hand the picture back to the crisp bodies once the release settles:
     goo fades, blur returns to rest, fills clear, data-liquid drops. */
  handoff(tl: gsap.core.Timeline, at: number): void;
}

export interface LiquidStretch {
  beginGrab(
    target: StretchTarget,
    event: StretchPointerEvent,
    base: { x: number; y: number },
  ): void;
  pointerMove(event: { clientX: number; clientY: number }): void;
  release(): void;
  /* For click handlers: clears the pressed flag and reports whether this
     click is the tail of a stretch (retargeted by pointer capture) and must
     be swallowed instead of toggling anything. */
  consumeClick(): boolean;
  /* Kill the release choreography — call before any full open/close run and
     on unmount. */
  kill(): void;
}

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function createLiquidStretch(host: StretchHost): LiquidStretch {
  let pressed = false;
  /* Cursor distance from the grab base during a hold — decides whether a
     release is a plain un-press or a sponge snap-back. */
  let stretchDist = 0;
  let suppressClick = false;
  let grabTarget: StretchTarget | null = null;
  /* The grabbed element's center, in the trigger's coordinate space — the
     chain parks there and every pull is measured from it. */
  let grabBase = { x: 0, y: 0 };
  /* The release choreography lives on its own timeline: killing a component's
     open/close run from a mere release would freeze drops mid-flight. */
  let timeline: gsap.core.Timeline | null = null;

  /* Pointer released or cancelled before a click could resolve: spring home.
     After a real pull the liquid finger snaps back into the rim and the
     grabbed body shakes itself out. */
  const release = () => {
    if (!pressed) {
      return;
    }
    pressed = false;

    const target = grabTarget;
    grabTarget = null;
    const base = grabBase;
    const wasStretched = stretchDist > 12;
    suppressClick = wasStretched;
    stretchDist = 0;

    timeline?.kill();
    const tl = gsap.timeline();
    timeline = tl;

    if (wasStretched) {
      /* The chain whips home head-first on the house spring, each bead a
         breath behind, and dissolves into the rim as it lands. */
      GRAB_CHAIN.forEach((_link, index) => {
        const bead = host.chain()[index];
        tl.to(
          bead,
          { x: base.x, y: base.y, duration: 0.5, ease: SPRING, overwrite: "auto" },
          index * 0.025,
        );
        tl.to(bead, { scale: 0, duration: 0.2, ease: "power2.in" }, 0.16 + index * 0.025);
      });
    }

    if (typeof target === "number") {
      /* A pulled aux body rides its position spring home — the ring IS the
         shake. (Scale wobble would orbit its remote transform origin.) */
      tl.to(host.auxTrio(target), { x: 0, y: 0, duration: 0.5, ease: SPRING, overwrite: "auto" }, 0);
    } else {
      const stretchBits = host.triggerStretchBits();
      tl.to(stretchBits, { x: 0, y: 0, duration: 0.5, ease: SPRING, overwrite: "auto" }, 0);
      tl.to(host.triggerIcon(), { x: 0, y: 0, duration: 0.5, ease: SPRING }, 0);
      /* A circle at rest hides its rotation — zero it silently. */
      tl.set(stretchBits, { rotation: 0 }, 0.55);
      if (wasStretched) {
        tl.to(
          host.triggerBits(),
          {
            keyframes: [
              { scaleX: 1.2, scaleY: 0.82, duration: 0.09, ease: "power2.out" },
              { scaleX: 0.93, scaleY: 1.09, duration: 0.11, ease: "power1.inOut" },
              { scaleX: 1, scaleY: 1, duration: 0.4, ease: SPRING },
            ],
            overwrite: "auto",
          },
          0.12,
        );
      } else {
        tl.to(host.triggerBits(), { scale: 1, duration: 0.45, ease: SPRING, overwrite: "auto" }, 0);
      }
    }

    /* Hand every picture back to its crisp version once the shake settles.
       (A click that follows kills this timeline and runs its own goo cycle.) */
    host.handoff(tl, wasStretched ? 0.45 : 0.3);
  };

  const beginGrab = (
    target: StretchTarget,
    event: StretchPointerEvent,
    base: { x: number; y: number },
  ) => {
    if (prefersReducedMotion() || event.button !== 0) {
      return;
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // pointer may no longer be active; the stretch just won't follow
    }
    pressed = true;
    stretchDist = 0;
    grabTarget = target;
    grabBase = { x: base.x, y: base.y };
    /* Clear a stale suppression: if a previous stretch ended somewhere the
       browser never retargeted a click from, the flag would otherwise eat
       this gesture's click instead of that one's. */
    suppressClick = false;

    host.liquidOn(target);
    gsap.set(host.chain(), { x: base.x, y: base.y, scale: 0.4 });
    [...host.grabbedBlobs(target), ...host.chain()].forEach((blob) =>
      blob?.setAttribute("fill", LIQUID_FILL_HOVER),
    );
    /* Capture can fail silently; a window-level backstop guarantees the
       release lands even if the pointer lets go far outside the button. */
    window.addEventListener("pointerup", release, { once: true });

    if (target === "trigger") {
      gsap.to(host.triggerBits(), { scale: 0.85, duration: 0.1, ease: OUT_STRONG, overwrite: "auto" });
    }
  };

  /* Hold and drag: only the grabbed PIECE of the edge stretches. The chain's
     head chases the cursor a clamped distance, the beads trail behind at
     fractions of the pull, and the goo renders it all as one liquid finger
     drawn out of the rim. The pull is measured from the grabbed element's own
     center, taken off the static anchor so the lean can't feed back in. */
  const pointerMove = (event: { clientX: number; clientY: number }) => {
    if (!pressed || grabTarget === null || prefersReducedMotion()) {
      return;
    }
    const anchorRect = host.anchor()?.getBoundingClientRect();
    if (!anchorRect) {
      return;
    }
    const half = host.buttonSize / 2;
    const dx = event.clientX - (anchorRect.left + half + grabBase.x);
    const dy = event.clientY - (anchorRect.top + half + grabBase.y);
    const dist = Math.hypot(dx, dy);
    stretchDist = dist;
    /* Small dead zone in the middle; past it the finger follows the cursor
       but never beyond GRAB_MAX — the sponge stops giving. */
    const reach = Math.max(0, dist - 6);
    const pull = Math.min(reach * 0.7, GRAB_MAX);
    const tension = pull / GRAB_MAX;
    const ux = dist > 0 ? dx / dist : 0;
    const uy = dist > 0 ? dy / dist : 0;

    GRAB_CHAIN.forEach((link, index) => {
      gsap.to(host.chain()[index], {
        x: grabBase.x + ux * pull * link.follow,
        y: grabBase.y + uy * pull * link.follow,
        scale: link.size * (1 - tension * link.thin),
        duration: link.lag,
        ease: "power3.out",
        overwrite: "auto",
      });
    });

    if (typeof grabTarget === "number") {
      /* The pulled aux body leans after the finger; its shape stays put
         (scale/rotation would orbit its remote transform origin). */
      gsap.to(host.auxTrio(grabTarget), {
        x: ux * pull * host.auxLean,
        y: uy * pull * host.auxLean,
        duration: 0.25,
        ease: "power3.out",
        overwrite: "auto",
      });
      return;
    }

    /* The trigger leans into the pull (up to ~8px) and stretches a touch
       along it — the mass visibly follows the grabbed piece. */
    gsap.to(host.triggerStretchBits(), {
      x: ux * pull * 0.18,
      y: uy * pull * 0.18,
      rotation: (Math.atan2(dy, dx) * 180) / Math.PI,
      scaleX: (1 + tension * 0.12) * 0.85,
      scaleY: (1 - tension * 0.06) * 0.85,
      duration: 0.25,
      ease: "power3.out",
      overwrite: "auto",
    });
    gsap.to(host.triggerIcon(), {
      x: ux * pull * 0.28,
      y: uy * pull * 0.28,
      duration: 0.25,
      ease: "power3.out",
      overwrite: "auto",
    });
  };

  const consumeClick = () => {
    pressed = false;
    if (suppressClick) {
      suppressClick = false;
      return true;
    }
    return false;
  };

  const kill = () => {
    timeline?.kill();
    timeline = null;
  };

  return { beginGrab, pointerMove, release, consumeClick, kill };
}
