import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type TransitionEvent as ReactTransitionEvent,
} from "react";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";

import { CircleIcon, PlusIcon, SquareIcon, TriangleIcon } from "./icons";
import { GOO_RIM_THRESHOLDS, gooThreshold, setGooBlur } from "../liquid/goo";
import { HOUSE_SPRING_POINTS, POP_SPRING_POINTS, springEase } from "../liquid/springs";
import {
  GRAB_CHAIN,
  createLiquidStretch,
  prefersReducedMotion,
  type LiquidStretch,
  type StretchTarget,
} from "../liquid/stretch";
import styles from "./LiquidMenu.module.css";

gsap.registerPlugin(CustomEase);

const SPRING = springEase("liquidSpring", HOUSE_SPRING_POINTS);
const POP = springEase("liquidPop", POP_SPRING_POINTS);
/* Anticipate — exit: wind up ~10% the wrong way, then collapse */
const ANTICIPATE = CustomEase.create("liquidAnticipate", "0.36,0,0.66,-0.56");
/* --ease-out-strong, for micro state and the press squash */
const OUT_STRONG = CustomEase.create("liquidOutStrong", "0.23,1,0.32,1");

const BUTTON_SIZE = 32;

/* Satellite fan, offsets from the trigger's center (Figma 9669:1765/70/75):
   one straight up, two flanking at 45°-ish. Rest tilt leans each drop toward
   its flight direction so the pop also swings it upright. */
const SATELLITES = [
  { id: "shape-circle", label: "Circle", Icon: CircleIcon, dx: -48, dy: -20, restRotation: -12 },
  { id: "shape-square", label: "Square", Icon: SquareIcon, dx: 0, dy: -48, restRotation: 6 },
  { id: "shape-triangle", label: "Triangle", Icon: TriangleIcon, dx: 48, dy: -20, restRotation: 12 },
] as const;

/* Resting scale: each shrunk satellite must hide entirely inside the 16px-
   radius trigger circle. The farthest satellite corner sits ≈73px from its
   scale origin (the button center), so 73 × scale ≈ 9px stays inside even
   while the press squash and the landing splat deform the button. */
const REST_SCALE = 0.12;

/* Just enough to bridge the fan gaps in flight (neck reach ≈ 1.3×blur with
   the 0.5-crossing threshold) — any more and the mass reads soft, not liquid. */
const GOO_BLUR_ACTIVE = 7;
/* Non-zero at rest so the alpha threshold has soft edges to bite on — a hard
   0 leaves it crunching the antialiasing into a staircase. */
const GOO_BLUR_REST = 1;
/* The grab finger's chain overlaps geometrically, so it needs less blur to
   read as liquid — and less blur means less curvature shrink on the circle
   while it's just being held. */
const GOO_BLUR_GRAB = 5;

/* Goo canvas geometry — must mirror .goo in the stylesheet. The trigger's
   center in the SVG's own coordinates anchors every blob. */
const GOO_PAD_RIGHT = 108;
/* 72px, not 60: a finger pulled the full GRAB_MAX (44) puts its head's edge
   ~53px below the button, and the blur's tail needs three σ (15px) more before
   it reaches zero. At 60 the last of it fell outside the canvas and was cut
   off with a straight edge and no rim. */
const GOO_PAD_BOTTOM = 72;
const GOO_WIDTH = 248; /* 108 + 32 + 108 */
const GOO_HEIGHT = 228; /* 72 + 32 + 124 */
const TRIGGER_CX = GOO_WIDTH - GOO_PAD_RIGHT - BUTTON_SIZE / 2; /* 124 */
const TRIGGER_CY = GOO_HEIGHT - GOO_PAD_BOTTOM - BUTTON_SIZE / 2; /* 140 */

if (import.meta.env.DEV && typeof window !== "undefined") {
  /* Headless-verification hook: lets tooling tick the clock by hand. */
  (window as { __liquidGsap?: typeof gsap }).__liquidGsap = gsap;
}

export function LiquidMenu() {
  const menuId = useId();
  const gooId = `liquid-goo-${useId().replace(/:/g, "")}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const gooRef = useRef<SVGSVGElement>(null);
  const bodiesRef = useRef<HTMLDivElement>(null);
  const blobTriggerRef = useRef<SVGCircleElement>(null);
  const grabChainRefs = useRef<(SVGCircleElement | null)[]>([]);
  const triggerBodyRef = useRef<HTMLDivElement>(null);
  const blobSatelliteRefs = useRef<(SVGCircleElement | null)[]>([]);
  const satelliteBodyRefs = useRef<(HTMLDivElement | null)[]>([]);
  const satelliteRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const blurRef = useRef<SVGFEGaussianBlurElement>(null);
  const rimEdgeRef = useRef<SVGFEColorMatrixElement>(null);
  const innerEdgeRef = useRef<SVGFEColorMatrixElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const stretchRef = useRef<LiquidStretch | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [tooltipIndex, setTooltipIndex] = useState<number | null>(null);
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const [isTooltipHiding, setIsTooltipHiding] = useState(false);

  /* Blur + rim thresholds are ONE setting — see liquid/goo.ts. */
  const applyGooBlur = useCallback(
    (blur: number, tl?: gsap.core.Timeline, at = 0) =>
      setGooBlur(
        { blur: blurRef.current, rim: rimEdgeRef.current, inner: innerEdgeRef.current },
        blur,
        tl,
        at,
      ),
    [],
  );

  /* Every body of the trigger — goo blob, bordered circle, glyph — squashes
     and springs together, or the button visually tears apart. */
  const getTriggerBits = useCallback(
    () => [blobTriggerRef.current, triggerBodyRef.current, iconRef.current],
    [],
  );

  /* Each satellite is one drop drawn three times — goo blob, bordered body,
     icon-carrying hit area — all riding the same tween. */
  const getSatelliteTrio = useCallback(
    (index: number) => [
      blobSatelliteRefs.current[index],
      satelliteBodyRefs.current[index],
      satelliteRefs.current[index],
    ],
    [],
  );

  /* The crisp halves of a satellite (body + icon button) fade as one; the goo
     blob never fades — it hides by scale. */
  const getSatelliteFadeBits = useCallback(
    (index: number) => [satelliteBodyRefs.current[index], satelliteRefs.current[index]],
    [],
  );

  /* The grab is the family's ONE shared gesture (liquid/stretch.ts) — this
     component only tells the engine which pieces make up its picture and how
     to switch its goo on and hand it back off. */
  if (stretchRef.current === null) {
    stretchRef.current = createLiquidStretch({
      buttonSize: BUTTON_SIZE,
      auxLean: 0.22,
      anchor: () => rootRef.current,
      triggerBits: getTriggerBits,
      triggerStretchBits: () => [blobTriggerRef.current, triggerBodyRef.current],
      triggerIcon: () => iconRef.current,
      chain: () => grabChainRefs.current,
      grabbedBlobs: (target: StretchTarget) => [
        target === "trigger" ? blobTriggerRef.current : blobSatelliteRefs.current[target],
      ],
      auxTrio: getSatelliteTrio,
      liquidOn: () => {
        /* The whole picture goes liquid: every blob stays in the goo, so a
           finger pulled into a neighbouring drop merges with it. */
        gsap.set(gooRef.current, { autoAlpha: 1 });
        gsap.set(bodiesRef.current, { autoAlpha: 0 });
        gsap.set([blobTriggerRef.current, ...blobSatelliteRefs.current], { autoAlpha: 1 });
        rootRef.current?.setAttribute("data-liquid", "");
        applyGooBlur(GOO_BLUR_GRAB);
      },
      handoff: (tl, at) => {
        tl.to(gooRef.current, { autoAlpha: 0, duration: 0.15, ease: "power1.out" }, at);
        applyGooBlur(GOO_BLUR_REST, tl, at + 0.16);
        tl.to(bodiesRef.current, { autoAlpha: 1, duration: 0.15, ease: "power1.out" }, at);
        tl.call(
          () => {
            rootRef.current?.removeAttribute("data-liquid");
            [
              blobTriggerRef.current,
              ...blobSatelliteRefs.current,
              ...grabChainRefs.current,
            ].forEach((blob) => blob?.removeAttribute("fill"));
          },
          undefined,
          at + 0.15,
        );
      },
    });
  }
  const stretch = stretchRef.current;

  useEffect(() => {
    SATELLITES.forEach((satellite, index) => {
      /* The button's center expressed in each satellite's own coordinates:
         scaling around it makes the drop grow out of the button itself. */
      const origin = `${BUTTON_SIZE / 2 - satellite.dx}px ${BUTTON_SIZE / 2 - satellite.dy}px`;
      gsap.set(getSatelliteTrio(index), {
        scale: REST_SCALE,
        rotation: satellite.restRotation,
        transformOrigin: origin,
      });
      gsap.set(getSatelliteFadeBits(index), { autoAlpha: 0 });
    });
    /* Exactly ONE of the two pictures exists at a time: at rest the crisp CSS
       circles; in motion the goo (which draws its own rim and shadow). Never
       both — even a sub-pixel of the other layer reads as a second border. */
    gsap.set(gooRef.current, { autoAlpha: 0 });
    gsap.set(bodiesRef.current, { autoAlpha: 1 });
    /* GSAP's default transformOrigin for SVG elements is their bbox corner —
       pin the trigger blob and the chain to their centers explicitly. */
    gsap.set(blobTriggerRef.current, { transformOrigin: "50% 50%" });
    gsap.set(grabChainRefs.current, { scale: 0, transformOrigin: "50% 50%" });

    return () => {
      timelineRef.current?.kill();
      stretchRef.current?.kill();
    };
  }, [getSatelliteFadeBits, getSatelliteTrio]);

  const setStaticState = useCallback(
    (open: boolean) => {
      SATELLITES.forEach((satellite, index) => {
        gsap.set(getSatelliteTrio(index), {
          scale: open ? 1 : REST_SCALE,
          rotation: open ? 0 : satellite.restRotation,
        });
        gsap.set(getSatelliteFadeBits(index), { autoAlpha: open ? 1 : 0 });
      });
      gsap.set(getTriggerBits(), { scale: 1 });
      gsap.set(iconRef.current, { rotation: open ? 135 : 0 });
      gsap.set(gooRef.current, { autoAlpha: 0 });
      gsap.set(bodiesRef.current, { autoAlpha: 1 });
      rootRef.current?.removeAttribute("data-liquid");
    },
    [getSatelliteFadeBits, getSatelliteTrio, getTriggerBits],
  );

  const openMenu = useCallback(() => {
    timelineRef.current?.kill();
    stretch.kill();
    setIsOpen(true);

    if (prefersReducedMotion()) {
      setStaticState(true);
      return;
    }

    const triggerBits = getTriggerBits();
    /* A full animation is always plain liquid — clear any held-piece tint. */
    [blobTriggerRef.current, ...blobSatelliteRefs.current, ...grabChainRefs.current].forEach(
      (blob) => blob?.removeAttribute("fill"),
    );
    rootRef.current?.setAttribute("data-liquid", "");
    const tl = gsap.timeline();
    timelineRef.current = tl;

    /* The goo takes over the picture entirely: its rim sits exactly where the
       CSS borders sat one frame earlier, so nothing appears to change — the
       outline just starts flowing. The bodies switch OFF for the ride: one
       border, one shadow, one body at a time. */
    tl.set(gooRef.current, { autoAlpha: 1 }, 0);
    tl.set(bodiesRef.current, { autoAlpha: 0 }, 0);
    /* Re-arm any per-element alphas a grab hold may have left behind. */
    tl.set(blobSatelliteRefs.current, { autoAlpha: 1 }, 0);
    tl.set(triggerBodyRef.current, { autoAlpha: 1 }, 0);
    /* Blur snaps to its working value in the SAME frame the goo takes over:
       the rim's width rides the blur, so passing through low blur while
       visible makes every border blink out — the flash. */
    applyGooBlur(GOO_BLUR_ACTIVE, tl, 0);

    /* The button swells and HOLDS while the drops gather — pressure building —
       and only lets go when the first drop fires. x/y return home too, in case
       the click landed at the end of a sponge stretch. */
    tl.set([blobTriggerRef.current, triggerBodyRef.current], { rotation: 0 }, 0);
    tl.to(triggerBits, { x: 0, y: 0, scale: 1.16, duration: 0.17, ease: OUT_STRONG }, 0);
    /* Park the grab chain in case this click ended a sponge pull mid-flight. */
    tl.to(
      grabChainRefs.current,
      { x: 0, y: 0, scale: 0, duration: 0.2, ease: OUT_STRONG, overwrite: "auto" },
      0,
    );
    tl.to(triggerBits, { scale: 1, duration: 0.45, ease: SPRING }, 0.2);
    /* The plus spins itself into an ×: a 135° throw on the house spring, so it
       overshoots the cross and rings back into place with the rest. */
    tl.to(iconRef.current, { rotation: 135, duration: 0.45, ease: SPRING }, 0.04);

    /* Droplets, in two beats. OOZE: the drop slowly bulges out of the button
       to ~40% — heavy, hanging, all surface tension, plainly readable. LAUNCH:
       the pop spring fires it the rest of the way — past full size, a dip, a
       settle — swinging upright from its resting tilt. During the launch the
       two axes ride the same spring 40ms out of phase (height leads, width
       lags) for the liquid squash-and-stretch. */
    SATELLITES.forEach((_satellite, index) => {
      const trio = getSatelliteTrio(index);
      const at = 0.03 + index * 0.045;
      tl.to(trio, { scale: 0.42, duration: 0.16, ease: "power1.inOut" }, at);
      tl.to(trio, { scaleY: 1, rotation: 0, duration: 0.3, ease: POP }, at + 0.16);
      tl.to(trio, { scaleX: 1, duration: 0.3, ease: POP }, at + 0.19);
      tl.to(
        getSatelliteFadeBits(index),
        { autoAlpha: 1, duration: 0.13, ease: OUT_STRONG },
        at + 0.18,
      );
    });

    /* Motion over: cross-fade to the identical crisp picture while the blur
       (and so the rim) is still at full working width — the drops sit outside
       each other's reach by now, so no necks linger. The blur resets silently
       once the goo is hidden; thinning it on screen blinks every border. */
    tl.to(gooRef.current, { autoAlpha: 0, duration: 0.22, ease: "power1.out" }, 0.56);
    tl.to(bodiesRef.current, { autoAlpha: 1, duration: 0.22, ease: "power1.out" }, 0.56);
    applyGooBlur(GOO_BLUR_REST, tl, 0.79);
    tl.call(() => rootRef.current?.removeAttribute("data-liquid"), undefined, 0.78);
  }, [applyGooBlur, getSatelliteFadeBits, getSatelliteTrio, getTriggerBits, setStaticState, stretch]);

  /* fromTrigger: the close came from pressing the button itself — its own
     press/release spring is already running when the drops land back. */
  const closeMenu = useCallback(
    (fromTrigger: boolean) => {
      timelineRef.current?.kill();
      stretch.kill();
      setIsOpen(false);

      if (prefersReducedMotion()) {
        setStaticState(false);
        return;
      }

      const triggerBits = getTriggerBits();
      [blobTriggerRef.current, ...blobSatelliteRefs.current, ...grabChainRefs.current].forEach(
        (blob) => blob?.removeAttribute("fill"),
      );
      rootRef.current?.setAttribute("data-liquid", "");
      const tl = gsap.timeline();
      timelineRef.current = tl;

      tl.set(gooRef.current, { autoAlpha: 1 }, 0);
      tl.set(bodiesRef.current, { autoAlpha: 0 }, 0);
      /* Re-arm any per-element alphas a grab hold may have left behind. */
      tl.set(blobSatelliteRefs.current, { autoAlpha: 1 }, 0);
      tl.set(triggerBodyRef.current, { autoAlpha: 1 }, 0);
      applyGooBlur(GOO_BLUR_ACTIVE, tl, 0);
      tl.to(iconRef.current, { rotation: 0, duration: 0.35, ease: SPRING }, 0);

      /* Exit takes a breath first, then moves briskly — each drop a blink of
         wind-up and a plunge into the button, width leading, height trailing.
         Last out, first in. */
      SATELLITES.forEach((satellite, index) => {
        const trio = getSatelliteTrio(index);
        const at = 0.1 + (SATELLITES.length - 1 - index) * 0.04;
        tl.to(trio, { scaleX: REST_SCALE, duration: 0.18, ease: ANTICIPATE }, at);
        tl.to(
          trio,
          { scaleY: REST_SCALE, rotation: satellite.restRotation, duration: 0.18, ease: ANTICIPATE },
          at + 0.04,
        );
        /* The icon rides the plunge and dissolves INTO it — fading only once
           the drop is visibly deforming, never leaving an empty ring behind. */
        tl.to(
          getSatelliteFadeBits(index),
          { autoAlpha: 0, duration: 0.1, ease: "power1.in" },
          at + 0.06,
        );
      });

      /* x/y return home first, in case the click ended a sponge stretch. */
      tl.set([blobTriggerRef.current, triggerBodyRef.current], { rotation: 0 }, 0);
      tl.to(triggerBits, { x: 0, y: 0, duration: 0.18, ease: OUT_STRONG }, 0);
      tl.to(
        grabChainRefs.current,
        { x: 0, y: 0, scale: 0, duration: 0.2, ease: OUT_STRONG, overwrite: "auto" },
        0,
      );
      if (fromTrigger) {
        /* Carry the pressed squash back up on the shared spring first. */
        tl.to(triggerBits, { scale: 1, duration: 0.18, ease: SPRING }, 0);
      }

      /* The drops land IN the button and the button is liquid too: a modest
         splat, a small slosh back, then it rings itself round again.
         overwrite kills the release spring the moment the hit takes over. */
      tl.to(
        triggerBits,
        {
          keyframes: [
            { scaleX: 1.16, scaleY: 0.86, duration: 0.08, ease: "power2.out" },
            { scaleX: 0.96, scaleY: 1.05, duration: 0.11, ease: "power1.inOut" },
            { scaleX: 1, scaleY: 1, duration: 0.35, ease: SPRING },
          ],
          overwrite: "auto",
        },
        0.32,
      );

      /* Drops are home; the splat's tail plays out on the crisp circle the
         goo hands over to — same shape, same border, seamless. Blur resets
         only after the goo is hidden, so the rim never thins on screen. */
      tl.to(gooRef.current, { autoAlpha: 0, duration: 0.15, ease: "power1.out" }, 0.46);
      tl.to(bodiesRef.current, { autoAlpha: 1, duration: 0.15, ease: "power1.out" }, 0.46);
      applyGooBlur(GOO_BLUR_REST, tl, 0.62);
      tl.call(() => rootRef.current?.removeAttribute("data-liquid"), undefined, 0.61);
    },
    [applyGooBlur, getSatelliteFadeBits, getSatelliteTrio, getTriggerBits, setStaticState, stretch],
  );

  const toggleMenu = useCallback(() => {
    if (stretch.consumeClick()) {
      return;
    }
    if (isOpen) {
      closeMenu(true);
    } else {
      openMenu();
    }
  }, [closeMenu, isOpen, openMenu, stretch]);

  /* The gesture itself lives in the shared engine — these are just the wires
     from React's pointer events into it. */
  const releasePress = useCallback(() => stretch.release(), [stretch]);

  const handleTriggerPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      stretch.beginGrab("trigger", event, { x: 0, y: 0 });
    },
    [stretch],
  );

  const handleGrabPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => stretch.pointerMove(event),
    [stretch],
  );

  /* Tooltip state machine — the avatar dropdown's pattern: mount → double
     rAF → visible (spring in); hide → hiding class (authored exit) →
     unmount on transitionend, with a fallback timer. */
  const showTooltip = useCallback((index: number) => {
    setIsTooltipHiding(false);
    setTooltipIndex(index);
    setIsTooltipVisible(false);

    if (prefersReducedMotion()) {
      setIsTooltipVisible(true);
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsTooltipVisible(true);
      });
    });
  }, []);

  const hideTooltipImmediately = useCallback(() => {
    setIsTooltipHiding(false);
    setIsTooltipVisible(false);
    setTooltipIndex(null);
  }, []);

  const hideTooltip = useCallback(() => {
    if (tooltipIndex === null || isTooltipHiding) {
      return;
    }

    if (prefersReducedMotion()) {
      hideTooltipImmediately();
      return;
    }

    setIsTooltipHiding(true);
    setIsTooltipVisible(false);
  }, [hideTooltipImmediately, isTooltipHiding, tooltipIndex]);

  const handleTooltipTransitionEnd = useCallback(
    (event: ReactTransitionEvent<HTMLSpanElement>) => {
      if (event.target !== event.currentTarget || event.propertyName !== "opacity") {
        return;
      }
      if (!isTooltipHiding) {
        return;
      }
      setIsTooltipHiding(false);
      setTooltipIndex(null);
    },
    [isTooltipHiding],
  );

  useEffect(() => {
    if (!isTooltipHiding) {
      return;
    }

    /* Backstop for a missed transitionend; must outlast the 160ms exit. */
    const fallbackTimer = window.setTimeout(() => {
      setIsTooltipHiding(false);
      setTooltipIndex(null);
    }, 260);

    return () => {
      window.clearTimeout(fallbackTimer);
    };
  }, [isTooltipHiding]);

  useEffect(() => {
    if (!isOpen) {
      hideTooltipImmediately();
    }
  }, [hideTooltipImmediately, isOpen]);

  /* Grabbing a satellite: same sponge, measured from ITS center. Only the
     grabbed drop melts — everything else keeps its crisp picture. */
  const handleSatellitePointerDown = useCallback(
    (index: number) =>
      (event: ReactPointerEvent<HTMLButtonElement>) => {
        hideTooltip();
        stretch.beginGrab(index, event, { x: SATELLITES[index].dx, y: SATELLITES[index].dy });
      },
    [hideTooltip, stretch],
  );

  /* A clean click on a satellite closes the fan; a stretch release doesn't. */
  const handleSatelliteClick = useCallback(() => {
    if (stretch.consumeClick()) {
      return;
    }
    closeMenu(false);
  }, [closeMenu, stretch]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeMenu(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMenu, isOpen]);

  return (
    <div ref={rootRef} className={styles.anchor}>
      {/* Layer 1: the real bodies — the resting picture: border, shadow. */}
      <div ref={bodiesRef} className={styles.bodies} aria-hidden="true">
        <div ref={triggerBodyRef} className={styles.triggerBody} />
        {SATELLITES.map((satellite, index) => (
          <div
            key={satellite.id}
            ref={(el) => {
              satelliteBodyRefs.current[index] = el;
            }}
            className={styles.satelliteBody}
            style={{ left: satellite.dx, top: satellite.dy }}
          />
        ))}
      </div>

      {/* Layer 2: the liquid — the moving picture: it draws its own rim and
          casts ONE shadow for the whole mass. A REAL <svg> with the filter on
          a <g>, because Safari won't reliably re-render `filter: url()`
          applied to an HTML element whose children animate. */}
      <svg
        ref={gooRef}
        className={styles.goo}
        width={GOO_WIDTH}
        height={GOO_HEIGHT}
        viewBox={`0 0 ${GOO_WIDTH} ${GOO_HEIGHT}`}
        style={{ filter: "drop-shadow(0 3px 6.25px rgba(0, 0, 0, 0.08))" }}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          {/* The filter region is the WHOLE canvas, in user units — not a
              percentage of the group's bounding box. A percentage region is
              measured off whatever the blobs currently occupy, which at rest
              is barely more than the 32px trigger: 15% of it is ~5px of
              margin, while the grab blur needs three σ before its tail
              reaches zero. Past that margin the liquid was cut off, and the
              box grows as a finger extends, so the crop crawled while you
              dragged. A fixed region does neither. */}
          <filter
            id={gooId}
            filterUnits="userSpaceOnUse"
            x="0"
            y="0"
            width={GOO_WIDTH}
            height={GOO_HEIGHT}
            colorInterpolationFilters="sRGB"
          >
            {/* blur + alpha threshold = the metaball neck between near surfaces */}
            <feGaussianBlur
              ref={blurRef}
              in="SourceGraphic"
              stdDeviation={GOO_BLUR_REST}
              result="blur"
            />
            {/* the OUTER contour: a threshold set below the half-way 0.5 by
                just enough to undo the curvature shrink a blur puts on a disc
                (σ²/2R), so the liquid's edge lands exactly where the crisp
                border's outer edge was. Its offset rides GOO_THRESHOLDS —
                the amount needed scales with the blur. */}
            <feColorMatrix
              ref={rimEdgeRef}
              in="blur"
              type="matrix"
              values={gooThreshold(GOO_RIM_THRESHOLDS[GOO_BLUR_REST][0])}
              result="goo"
            />
            {/* the INNER contour: a second, higher threshold of the same blur
                carves the interior, and the rim is the sliver between the two.
                Their gap is what makes the border 1px wide — in ALPHA, so the
                distance it works out to in PIXELS scales with the blur, which
                is why the pair is calibrated per blur. The interior keeps the
                BLURRED SOURCE COLORS (the RGB rows are identity), so each blob
                wears its own fill and two different fills blend into a soft
                gradient right at the neck where they merge. */}
            <feColorMatrix
              ref={innerEdgeRef}
              in="blur"
              type="matrix"
              values={gooThreshold(GOO_RIM_THRESHOLDS[GOO_BLUR_REST][1])}
              result="inner"
            />
            <feFlood floodColor="#dadada" result="rimColor" />
            <feComposite in="rimColor" in2="goo" operator="in" result="rimFull" />
            <feMerge>
              <feMergeNode in="rimFull" />
              <feMergeNode in="inner" />
            </feMerge>
          </filter>
        </defs>
        <g filter={`url(#${gooId})`}>
          <circle
            ref={blobTriggerRef}
            className={styles.blob}
            cx={TRIGGER_CX}
            cy={TRIGGER_CY}
            r={BUTTON_SIZE / 2}
          />
          {GRAB_CHAIN.map((link, index) => (
            <circle
              key={link.follow}
              ref={(el) => {
                grabChainRefs.current[index] = el;
              }}
              className={styles.blob}
              cx={TRIGGER_CX}
              cy={TRIGGER_CY}
              r={11}
            />
          ))}
          {SATELLITES.map((satellite, index) => (
            <circle
              key={satellite.id}
              ref={(el) => {
                blobSatelliteRefs.current[index] = el;
              }}
              className={styles.blob}
              cx={TRIGGER_CX + satellite.dx}
              cy={TRIGGER_CY + satellite.dy}
              r={BUTTON_SIZE / 2}
            />
          ))}
        </g>
      </svg>

      {/* Layer 3: icons and hit areas, flying above the liquid. */}
      <div id={menuId} className={styles.menuLayer} role="menu" aria-label="Shapes menu" inert={!isOpen}>
        {SATELLITES.map((satellite, index) => (
          <button
            key={satellite.id}
            ref={(el) => {
              satelliteRefs.current[index] = el;
            }}
            type="button"
            role="menuitem"
            aria-label={satellite.label}
            className={styles.satellite}
            style={{ left: satellite.dx, top: satellite.dy }}
            onClick={handleSatelliteClick}
            onPointerEnter={() => showTooltip(index)}
            onPointerLeave={hideTooltip}
            onPointerDown={handleSatellitePointerDown(index)}
            onPointerMove={handleGrabPointerMove}
            onPointerUp={releasePress}
            onPointerCancel={releasePress}
          >
            <satellite.Icon />
            {tooltipIndex === index ? (
              <span
                className={[
                  styles.tooltipAnchor,
                  isTooltipVisible ? styles.tooltipVisible : "",
                  isTooltipHiding ? styles.tooltipHiding : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-hidden="true"
                onTransitionEnd={handleTooltipTransitionEnd}
              >
                <span className={styles.tooltip}>{satellite.label}</span>
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={toggleMenu}
        onPointerDown={handleTriggerPointerDown}
        onPointerMove={handleGrabPointerMove}
        onPointerUp={releasePress}
        onPointerLeave={releasePress}
        onPointerCancel={releasePress}
      >
        <span ref={iconRef} className={styles.triggerIcon}>
          <PlusIcon />
        </span>
      </button>
    </div>
  );
}
