import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type TransitionEvent as ReactTransitionEvent,
} from "react";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";

import { CircleIcon, PlusIcon, SquareIcon, TriangleIcon } from "./icons";
import { GOO_RIM_THRESHOLDS, gooThreshold, setGooBlur } from "../liquid/goo";
import { SHAPE_HUES, motifHue, seamHue, type BubbleHue } from "../liquid/hues";
import { createLiquidSeam, type LiquidSeam, type SeamJoint } from "../liquid/seam";
import { gooSfx } from "../liquid/sfx";
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

/* One hue per BODY, and only for the light. The bodies never change —
   every drop wears var(--liquid-surface) at all times, in both themes, still
   or liquid — a joint announces itself ONLY as colour running through the
   border. The PlayStation reading of the glyphs — circle red, square pink,
   triangle green, cross blue-violet — pushed bright enough to carry on the
   dark frame: which button the finger is touching is legible at a glance.

   The trigger IS the cross: it wears the cross's blue-violet — on hover, in
   a joint (its side of the two-hue gradient), and in the neon a completed
   merge puts under the X. The hues themselves live in liquid/hues.ts — one
   table for the family. */
export type { BubbleHue };

/* Satellite fan, offsets from the trigger's center — the PlayStation pad's
   own compass around the X: square LEFT, triangle UP, circle RIGHT. Rest
   tilt leans each drop toward its flight direction so the pop also swings
   it upright. */
const SATELLITES = [
  {
    id: "shape-square",
    label: "Square",
    Icon: SquareIcon,
    dx: -48,
    dy: -20,
    restRotation: -12,
    hue: SHAPE_HUES.square,
  },
  {
    id: "shape-triangle",
    label: "Triangle",
    Icon: TriangleIcon,
    dx: 0,
    dy: -48,
    restRotation: 6,
    hue: SHAPE_HUES.triangle,
  },
  {
    id: "shape-circle",
    label: "Circle",
    Icon: CircleIcon,
    dx: 48,
    dy: -20,
    restRotation: 12,
    hue: SHAPE_HUES.circle,
  },
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

/* What each body says when it welds. The X sits lowest — it is the mass
   every joint is made against — and the satellites climb along the arc they
   stand on, left to right, so a contact tells you WHICH contact it is. */
const WELD_PITCH: Record<string, number> = {
  trigger: 0.8,
  "satellite-0": 0.95,
  "satellite-1": 1.08,
  "satellite-2": 1.2,
};

/* The lit stretch of border at rest — the engine drives the real one. */
const SEAM_RADIUS = 20;

/* One layer per BODY that can be lit at the same time — every drop shows its
   own hue on its own side of whatever it is touching (see liquid/seam.ts).
   Six: four bodies can be in the picture at once (the X and three
   satellites), plus spares so a body coming up never stands dark waiting for
   a fading layer to die — the light has to land the instant the rims lean,
   not a tenth of a second after. */
const SEAM_LAYERS = [0, 1, 2, 3, 4, 5];

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

export type LiquidMenuTheme = "light" | "dark";

export interface LiquidMenuProps {
  /* The frame the dial is standing on — light by default, the dark frame
     (Figma "Admin" 9688:1748) under "dark". It only swaps the colour variables
     in the stylesheet; every spring, blur and threshold is the same one. */
  theme?: LiquidMenuTheme;
}

export function LiquidMenu({ theme = "light" }: LiquidMenuProps = {}) {
  const menuId = useId();
  const gooId = `liquid-goo-${useId().replace(/:/g, "")}`;
  /* The seam's three parts: a filter that keeps ONLY the rim, a mask made of
     it, and the gradient the rim is repainted with through the joint. */
  const blobsId = `${gooId}-blobs`;
  const rimOnlyId = `${gooId}-rim`;
  const rimMaskId = `${gooId}-mask`;
  const seamGradientId = `${gooId}-seam`;
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
  const maskBlurRef = useRef<SVGFEGaussianBlurElement>(null);
  const maskRimEdgeRef = useRef<SVGFEColorMatrixElement>(null);
  const maskInnerEdgeRef = useRef<SVGFEColorMatrixElement>(null);
  /* One gradient and one wash per lit BODY. */
  const seamGradientRefs = useRef<(SVGRadialGradientElement | null)[]>([]);
  const seamPaintRefs = useRef<(SVGRectElement | null)[]>([]);
  const seamStopRefs = useRef<(SVGStopElement | null)[][]>([]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const stretchRef = useRef<LiquidStretch | null>(null);
  const seamRef = useRef<LiquidSeam | null>(null);
  /* Whose border the grab is currently stretching — the finger's beads belong
     to it, so they cannot light a joint against their own body. */
  const grabbedOwnerRef = useRef("trigger");

  /* Each body's light colour on the frame we are standing on, by the same
     owner names the seam engine works in. The trigger is the CROSS — its
     side of a joint runs the cross's blue-violet. On the light frame there
     is no motif: every side of every joint wears the file's own seam violet,
     so a joint still lights, it just no longer says WHICH button. */
  const hueOf = useCallback(
    (owner: string) => {
      const bubble =
        owner === "trigger"
          ? SHAPE_HUES.cross
          : SATELLITES[Number(owner.replace("satellite-", ""))]?.hue ?? SHAPE_HUES.cross;
      return motifHue(bubble, theme);
    },
    [theme],
  );
  const [isOpen, setIsOpen] = useState(false);
  /* isOpen, readable from the stretch engine's callbacks — the engine is
     created once, so a state value captured in its closures would stay at the
     first render's false forever. */
  const isOpenRef = useRef(false);
  const [tooltipIndex, setTooltipIndex] = useState<number | null>(null);
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const [isTooltipHiding, setIsTooltipHiding] = useState(false);

  /* Exactly ONE shadow at any moment. The goo casts its own (drop-shadow on
     the svg) while it owns the picture; the crisp bodies carry box-shadows.
     At a handoff the bodies snap visible UNDER the still-opaque goo, so for
     the goo's fade both would cast — a doubled shadow that pulses dark and
     reads as the shadow blinking. So the goo's shadow switches off in the
     SAME frame the bodies snap on: same shapes, same offsets, the one shadow
     just changes hands invisibly. */
  const setGooShadow = useCallback((on: boolean) => {
    if (gooRef.current) {
      gooRef.current.style.filter = on ? "var(--liquid-goo-shadow)" : "none";
    }
  }, []);

  /* Blur + rim thresholds are ONE setting — see liquid/goo.ts. */
  const applyGooBlur = useCallback((blur: number, tl?: gsap.core.Timeline, at = 0) => {
    setGooBlur(
      { blur: blurRef.current, rim: rimEdgeRef.current, inner: innerEdgeRef.current },
      blur,
      tl,
      at,
    );
    /* The mask carves its rim out of the same blur with the same pair of
       thresholds — a mask one setting behind would let the blue slip off the
       border it is supposed to be painted on. */
    setGooBlur(
      { blur: maskBlurRef.current, rim: maskRimEdgeRef.current, inner: maskInnerEdgeRef.current },
      blur,
      tl,
      at,
    );
  }, []);

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

  /* The engines are created ONCE and live in refs, so any behaviour handed to
     them directly would be frozen at the first render — stale after a hot
     reload, stale after a theme change. These refs are reassigned EVERY
     render, and the engines call through them, so the newest code always
     answers. */
  const liquidOnRef = useRef<(target: StretchTarget) => void>(() => {});
  const handoffRef = useRef<(tl: gsap.core.Timeline, at: number) => void>(() => {});

  liquidOnRef.current = (target: StretchTarget) => {
    grabbedOwnerRef.current = target === "trigger" ? "trigger" : `satellite-${target}`;

    /* A grab that lands MID-FLIGHT takes the picture over. The open/close run
       schedules its own handoff — bodies back on, goo faded out, data-liquid
       dropped — and left alive it fires a few hundred milliseconds into the
       gesture and takes the liquid away while a finger is still being pulled:
       the stretch, the seam and the merge all vanish into crisp circles.
       Killed here, the fan is then walked to wherever it was heading, so
       nothing is stranded half-open by the interruption. */
    if (timelineRef.current?.isActive()) {
      timelineRef.current.kill();
      const settled = isOpenRef.current;
      /* ON the component's own timeline, not as loose tweens. openMenu and
         closeMenu begin by killing exactly this reference; tweens started
         outside it survive that kill and keep writing toward the state the
         interrupted run was heading for — which is how a click that reopened
         mid-close ended with the picture set visible and then dragged back to
         nothing a tenth of a second later. */
      const settle = gsap.timeline();
      timelineRef.current = settle;
      SATELLITES.forEach((satellite, index) => {
        settle.to(
          getSatelliteTrio(index),
          {
            scale: settled ? 1 : REST_SCALE,
            rotation: settled ? 0 : satellite.restRotation,
            duration: 0.16,
            ease: OUT_STRONG,
            overwrite: "auto",
          },
          0,
        );
        settle.to(
          getSatelliteFadeBits(index),
          { autoAlpha: settled ? 1 : 0, duration: 0.12, ease: OUT_STRONG, overwrite: "auto" },
          0,
        );
      });
      settle.to(
        iconRef.current,
        { rotation: settled ? 135 : 0, duration: 0.16, ease: OUT_STRONG, overwrite: "auto" },
        0,
      );
    }

    setGooShadow(true);
    gsap.set(gooRef.current, { autoAlpha: 1 });
    gsap.set(bodiesRef.current, { autoAlpha: 0 });
    gsap.set(blobTriggerRef.current, { autoAlpha: 1 });
    gsap.set(blobSatelliteRefs.current, { autoAlpha: isOpenRef.current ? 1 : 0 });
    rootRef.current?.setAttribute("data-liquid", "");
    /* Two different questions, two different flags.

       data-grab: is the gesture's PICTURE still live? It has to outlast the
       release — the drops are still flying home and their joints still light
       — so the seam engine reads this one.

       data-held: is the finger still ON something? That ends the moment you
       let go, and it is what the cross's colour follows. Keyed by WHOSE grab
       it is, because a satellite being pulled is not the cross's business. */
    rootRef.current?.setAttribute("data-grab", "");
    rootRef.current?.setAttribute("data-held", grabbedOwnerRef.current);
    gooSfx.play("grab", { frame: theme });
    applyGooBlur(GOO_BLUR_GRAB);
  };

  handoffRef.current = (tl, at) => {
    /* Synchronous, not on the timeline: handoff is called the instant the
       pointer comes up, while the tweens it schedules play out over the next
       half second. The hold is over NOW — leaving it set until the picture
       finished landing kept the cross lit for the whole spring home, so its
       colour drained a beat after the gesture rather than with it. */
    rootRef.current?.removeAttribute("data-held");
    gooSfx.play("release", { frame: theme });
    /* The crisp bodies SNAP on underneath the still-opaque goo — the two
       pictures are identical, so nothing changes on screen — and only the
       goo fades. Crossfading both was the end-of-gesture blink: two
       copies of the same picture at half alpha are 25% short of one. The
       goo's shadow hands over to the bodies' in the same frame, so the
       shadow never doubles during the fade. */
    tl.set(bodiesRef.current, { autoAlpha: 1 }, at);
    tl.call(() => setGooShadow(false), undefined, at);
    tl.to(gooRef.current, { autoAlpha: 0, duration: 0.15, ease: "power1.out" }, at);
    applyGooBlur(GOO_BLUR_REST, tl, at + 0.16);
    /* Shadow re-armed the moment the goo is fully hidden — "off" exists
       only for the fade itself, never as a lingering state. */
    tl.call(() => setGooShadow(true), undefined, at + 0.16);
    tl.call(
      () => {
        rootRef.current?.removeAttribute("data-liquid");
        rootRef.current?.removeAttribute("data-grab");
      },
      undefined,
      at + 0.15,
    );
  };

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
      auxTrio: getSatelliteTrio,
      liquidOn: (target) => liquidOnRef.current(target),
      handoff: (tl, at) => handoffRef.current(tl, at),
      /* Closed the glyph is a plus — the opener, and the most liquid thing
         here. Open it is the pad's CROSS, so it is grabbed exactly like the
         circle, square and triangle it sits among. */
      triggerRigid: () => isOpenRef.current,
    });
  }
  const stretch = stretchRef.current;

  /* Every body paints its OWN side in its OWN hue — the X blue-violet, the
     circle red, and so on — so a joint runs one into the other and a
     three-body cluster still shows three colours. Reassigned every render
     (see liquidOnRef) so it follows the theme. */
  const seamPaintFnRef = useRef<(index: number, owner: string) => void>(() => {});
  seamPaintFnRef.current = (index, owner) => {
    const stops = seamStopRefs.current[index];
    if (!stops) {
      return;
    }
    /* The dark frame's whisper of white lives in seamHue — shared, so every
       surface's joints stand on the near-black rim the same way. Light: no
       motif, so the lobes fall back to the stylesheet's own seam colour and
       the joint reads as one uniform light. */
    const hue = hueOf(owner);
    const paint = hue === null ? "var(--liquid-seam)" : seamHue(hue, theme);
    stops.forEach((stop) => stop?.setAttribute("stop-color", paint));
  };

  /* Neon glyphs — strictly by MERGE. A glyph lights only when its own body
     is in a completed weld (the engine's `joined`): a touch, a lean, even a
     bright seam are not enough — a drop hanging off a lit seam while two
     OTHERS merge stays dark, because its border has not crossed anything.
     Three glyphs light together exactly when all three have genuinely sunk
     into one mass in the middle, since only then does every one of them sit
     in a joined pair. The X follows the same rule as the satellites.

     Styles are written only on a state change; the CSS transition does the
     breathing. */
  const litOwnersRef = useRef<Set<string>>(new Set());
  const jointsFnRef = useRef<(joints: SeamJoint[]) => void>(() => {});
  jointsFnRef.current = (joints) => {
    const merged = new Set<string>();
    joints.forEach((joint) => {
      if (joint.joined) {
        joint.owners.forEach((owner) => merged.add(owner));
      }
    });

    /* The feedback is one ATTRIBUTE, never a bundle of inline styles: the
       stylesheet already says what a lit satellite looks like (it is the
       hover's own declaration), so a merge simply asks for that same state.
       One description of the look, two ways to reach it — and the light
       frame stays dark because those rules are the dark frame's. */
    const lit = litOwnersRef.current;
    const mark = (owner: string, el: HTMLElement | null) => {
      const on = merged.has(owner);
      if (on === lit.has(owner) || !el) {
        return;
      }
      if (on) {
        lit.add(owner);
        el.setAttribute("data-merged", "");
        /* The moment two rims become one — the sound belongs to the weld
           itself, not to the gesture that made it. Each BODY speaks in its
           own pitch, along the same arc its drop sits on (the X deepest, it
           is the thing everything else is welded to), and each gets its own
           gate bucket so a pair is heard as a pair rather than one of them
           silencing the other. Which two things touched is then something
           you can hear without looking. */
        gooSfx.play("weld", {
          frame: theme,
          pitch: WELD_PITCH[owner] ?? 1,
          key: owner,
        });
      } else {
        lit.delete(owner);
        el.removeAttribute("data-merged");
      }
    };

    SATELLITES.forEach((_satellite, index) => {
      mark(`satellite-${index}`, satelliteRefs.current[index]);
    });
    mark("trigger", triggerRef.current);
  };

  if (seamRef.current === null) {
    seamRef.current = createLiquidSeam({
      anchor: () => rootRef.current,
      parts: () => [
        { blob: blobTriggerRef.current, owner: "trigger" },
        ...blobSatelliteRefs.current.map((blob, index) => ({ blob, owner: `satellite-${index}` })),
        ...grabChainRefs.current.map((blob) => ({ blob, owner: grabbedOwnerRef.current })),
      ],
      layers: () =>
        SEAM_LAYERS.map((_, index) => ({
          gradient: seamGradientRefs.current[index] ?? null,
          paint: seamPaintRefs.current[index] ?? null,
        })),
      paint: (index, owner) => seamPaintFnRef.current(index, owner),
      joints: (joints) => jointsFnRef.current(joints),
    });
  }

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

    /* The engine runs on BOTH frames. Its light is the dark frame's motif —
       and on the light frame the wash is hidden outright in the stylesheet,
       so a border there stays a border — but what the engine reports is not
       only paint: it is WHERE and WHETHER two rims have met, which is what
       the glyphs and the voice answer to. Silencing the contacts on the
       light stage along with their colour would have taken the sound of the
       liquid with it. */
    seamRef.current?.start();

    return () => {
      timelineRef.current?.kill();
      stretchRef.current?.kill();
      seamRef.current?.kill();
    };
    /* Mount only. This effect PLACES the resting picture and its cleanup
       kills every engine, so anything that re-runs it mid-life re-parks the
       satellites at rest while `isOpen` still says otherwise: the fan looks
       shut, the state says open, and the trigger answers the wrong question
       on the next click. It used to list `theme` — from when the seam was
       started only on the dark frame — and a frame change on the two-frame
       stage was exactly that re-run. The engine now runs on both frames, so
       the dependency is gone with it. */
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
      rootRef.current?.removeAttribute("data-grab");
      rootRef.current?.removeAttribute("data-held");
    },
    [getSatelliteFadeBits, getSatelliteTrio, getTriggerBits],
  );

  const openMenu = useCallback(() => {
    timelineRef.current?.kill();
    stretch.kill();
    setIsOpen(true);
    isOpenRef.current = true;

    if (prefersReducedMotion()) {
      setStaticState(true);
      return;
    }

    const triggerBits = getTriggerBits();
    rootRef.current?.setAttribute("data-liquid", "");
    rootRef.current?.removeAttribute("data-grab");
    rootRef.current?.removeAttribute("data-held");
    const tl = gsap.timeline();
    timelineRef.current = tl;

    /* The goo takes over the picture entirely: its rim sits exactly where the
       CSS borders sat one frame earlier, so nothing appears to change — the
       outline just starts flowing. The bodies switch OFF for the ride: one
       border, one shadow, one body at a time. */
    tl.call(() => setGooShadow(true), undefined, 0);
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
      /* A voice per drop, on the beat that drop LAUNCHES — not one sound for
         the fan. Three knocks a breath apart is what the eye is watching, so
         it is what the ear should hear, and each is pitched along the arc
         (left low, right high) so they read as a figure rather than a
         stutter on one note. */
      tl.call(
        () => gooSfx.play("pop", { frame: theme, pitch: 0.9 + index * 0.11 }),
        undefined,
        at + 0.16,
      );
      tl.to(trio, { scale: 0.42, duration: 0.16, ease: "power1.inOut" }, at);
      tl.to(trio, { scaleY: 1, rotation: 0, duration: 0.3, ease: POP }, at + 0.16);
      tl.to(trio, { scaleX: 1, duration: 0.3, ease: POP }, at + 0.19);
      tl.to(
        getSatelliteFadeBits(index),
        { autoAlpha: 1, duration: 0.13, ease: OUT_STRONG },
        at + 0.18,
      );
    });

    /* Motion over: the crisp picture snaps on UNDER the still-opaque goo —
       identical pixels, so nothing changes on screen — and the goo alone
       fades. Crossfading both was the end-of-flight blink: two copies of the
       same picture at half alpha are 25% short of one. The blur resets
       silently once the goo is hidden; thinning it on screen blinks every
       border. */
    tl.set(bodiesRef.current, { autoAlpha: 1 }, 0.56);
    tl.call(() => setGooShadow(false), undefined, 0.56);
    tl.to(gooRef.current, { autoAlpha: 0, duration: 0.22, ease: "power1.out" }, 0.56);
    applyGooBlur(GOO_BLUR_REST, tl, 0.79);
    tl.call(() => setGooShadow(true), undefined, 0.79);
    tl.call(() => rootRef.current?.removeAttribute("data-liquid"), undefined, 0.78);
  }, [applyGooBlur, getSatelliteFadeBits, getSatelliteTrio, getTriggerBits, setGooShadow, setStaticState, stretch, theme]);

  /* fromTrigger: the close came from pressing the button itself — its own
     press/release spring is already running when the drops land back. */
  const closeMenu = useCallback(
    (fromTrigger: boolean) => {
      timelineRef.current?.kill();
      stretch.kill();
      setIsOpen(false);
      isOpenRef.current = false;

      if (prefersReducedMotion()) {
        setStaticState(false);
        return;
      }

      const triggerBits = getTriggerBits();
      rootRef.current?.setAttribute("data-liquid", "");
      rootRef.current?.removeAttribute("data-grab");
      rootRef.current?.removeAttribute("data-held");
      const tl = gsap.timeline();
      timelineRef.current = tl;

      tl.call(() => setGooShadow(true), undefined, 0);
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
        /* A voice per drop as it goes IN, the mirror of the three that took
           it out — on the beat each one finishes its plunge, and pitched
           along the same arc, so the fan closes as a falling figure in the
           order the drops actually dive: last out, first in. */
        tl.call(
          () => gooSfx.play("land", { frame: theme, pitch: 0.9 + index * 0.11 }),
          undefined,
          at + 0.19,
        );
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
         goo hands over to — same shape, same border, seamless. Bodies snap on
         under the opaque goo (crossfading both was the landing blink) and the
         goo alone fades. Blur resets only after the goo is hidden, so the rim
         never thins on screen. */
      tl.set(bodiesRef.current, { autoAlpha: 1 }, 0.46);
      tl.call(() => setGooShadow(false), undefined, 0.46);
      tl.to(gooRef.current, { autoAlpha: 0, duration: 0.15, ease: "power1.out" }, 0.46);
      applyGooBlur(GOO_BLUR_REST, tl, 0.62);
      tl.call(() => setGooShadow(true), undefined, 0.62);
      tl.call(() => rootRef.current?.removeAttribute("data-liquid"), undefined, 0.61);
    },
    [applyGooBlur, getSatelliteFadeBits, getSatelliteTrio, getTriggerBits, setGooShadow, setStaticState, stretch, theme],
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
  const showTooltip = useCallback(
    (index: number) => {
      /* The dark frame goes without them: on that stage the pill is a second
         bright surface floating over the drops, and it talks over the liquid
         instead of labelling it. */
      if (theme === "dark") {
        return;
      }

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
    },
    [theme],
  );

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
    <div
      ref={rootRef}
      className={styles.anchor}
      data-theme={theme}
      style={{ "--liquid-x-hue": motifHue(SHAPE_HUES.cross, theme) ?? "" } as CSSProperties}
    >
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
        style={{ filter: "var(--liquid-goo-shadow)" }}
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
            {/* The rim's colour is the theme's, read off the anchor: the
                flood has to be the SAME solid the crisp CSS border wears, or
                the two pictures the component crossfades between would not
                match. */}
            <feFlood style={{ floodColor: "var(--liquid-rim)" }} result="rimColor" />
            <feComposite in="rimColor" in2="goo" operator="in" result="rimFull" />
            <feMerge>
              <feMergeNode in="rimFull" />
              <feMergeNode in="inner" />
            </feMerge>
          </filter>

          {/* The SAME chain again, and it has to stay the same: one blur, one
              pair of thresholds, so the sliver this carves is the exact sliver
              the goo paints. Here the sliver is flooded WHITE and the interior
              is dropped, which makes it a mask of the border and nothing else
              — the blue can then be laid over the rim without ever spilling
              onto the drop's face or the frame behind it. */}
          <filter
            id={rimOnlyId}
            filterUnits="userSpaceOnUse"
            x="0"
            y="0"
            width={GOO_WIDTH}
            height={GOO_HEIGHT}
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur
              ref={maskBlurRef}
              in="SourceGraphic"
              stdDeviation={GOO_BLUR_REST}
              result="blur"
            />
            <feColorMatrix
              ref={maskRimEdgeRef}
              in="blur"
              type="matrix"
              values={gooThreshold(GOO_RIM_THRESHOLDS[GOO_BLUR_REST][0])}
              result="outer"
            />
            <feColorMatrix
              ref={maskInnerEdgeRef}
              in="blur"
              type="matrix"
              values={gooThreshold(GOO_RIM_THRESHOLDS[GOO_BLUR_REST][1])}
              result="inner"
            />
            <feComposite in="outer" in2="inner" operator="out" result="rimOnly" />
            <feFlood floodColor="#ffffff" result="white" />
            <feComposite in="white" in2="rimOnly" operator="in" />
          </filter>

          <mask
            id={rimMaskId}
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            width={GOO_WIDTH}
            height={GOO_HEIGHT}
          >
            {/* The same blobs, drawn a second time through the rim filter —
                a <use> instance, so the mask cannot drift from the picture:
                every tween that moves a drop moves its mask with it. */}
            <g filter={`url(#${rimOnlyId})`}>
              <use href={`#${blobsId}`} />
            </g>
          </mask>

          {/* One lobe per lit body: its own hue at its own side of the joint,
              dying out by OPACITY along its border — the rim's own colour
              simply shows through where the light ends, so the walk out of a
              joint is always clean hue over rim, never a muddy mix. */}
          {SEAM_LAYERS.map((layer) => (
            <radialGradient
              key={layer}
              ref={(el) => {
                seamGradientRefs.current[layer] = el;
              }}
              id={`${seamGradientId}-${layer}`}
              gradientUnits="userSpaceOnUse"
              cx={TRIGGER_CX}
              cy={TRIGGER_CY}
              r={SEAM_RADIUS}
            >
              {[
                { offset: 0, alpha: 1 },
                { offset: 55, alpha: 0.9 },
                { offset: 100, alpha: 0 },
              ].map(({ offset, alpha }, stop) => (
                <stop
                  key={offset}
                  ref={(el) => {
                    seamStopRefs.current[layer] = seamStopRefs.current[layer] ?? [];
                    seamStopRefs.current[layer][stop] = el;
                  }}
                  offset={`${offset}%`}
                  stopColor="var(--liquid-seam)"
                  stopOpacity={alpha}
                />
              ))}
            </radialGradient>
          ))}
        </defs>
        <g filter={`url(#${gooId})`}>
          <g id={blobsId}>
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
        </g>

        {/* The light rides the border itself: one full-canvas wash per lit
            body, cut down to the rim by the shared mask. Its opacity is the
            engine's only output; where the lobe sits is in its gradient's
            own centre and radius. */}
        {SEAM_LAYERS.map((layer) => (
          <rect
            key={layer}
            ref={(el) => {
              seamPaintRefs.current[layer] = el;
            }}
            className={styles.seam}
            x="0"
            y="0"
            width={GOO_WIDTH}
            height={GOO_HEIGHT}
            fill={`url(#${seamGradientId}-${layer})`}
            mask={`url(#${rimMaskId})`}
          />
        ))}
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
            style={
              {
                left: satellite.dx,
                top: satellite.dy,
                "--sat-hue": motifHue(satellite.hue, theme) ?? "",
              } as CSSProperties
            }
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
