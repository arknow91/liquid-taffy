import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";

import { ICON_PATHS, PlusIcon } from "../LiquidMenu/icons";
import { GOO_RIM_THRESHOLDS, gooThreshold, setGooBlur } from "../liquid/goo";
import { SHAPE_HUES, motifHue, neonGlow, seamHue } from "../liquid/hues";
import { createLiquidSeam, type LiquidSeam, type SeamJoint } from "../liquid/seam";
import { HOUSE_SPRING_POINTS, POP_SPRING_POINTS, springEase } from "../liquid/springs";
import { IconMorph } from "../liquid/IconMorph";
import { RowHover } from "../liquid/RowHover";
import { rowSelectionStyle } from "../liquid/select";
import { gooSfx } from "../liquid/sfx";
import { SelectionBurst } from "../liquid/SelectionBurst";
import { squirclePath } from "../liquid/squircle";
import {
  GRAB_CHAIN,
  createLiquidStretch,
  prefersReducedMotion,
  type LiquidStretch,
} from "../liquid/stretch";
import styles from "./LiquidAdd.module.css";

gsap.registerPlugin(CustomEase);

const SPRING = springEase("liquidAddSpring", HOUSE_SPRING_POINTS);
const POP = springEase("liquidAddPop", POP_SPRING_POINTS);
const OUT_STRONG = CustomEase.create("liquidAddOutStrong", "0.23,1,0.32,1");
const MORPH = CustomEase.create("liquidAddMorph", "0.5,0,0.1,1");
const BACK_OUT = CustomEase.create("liquidAddBackOut", "0.34,1.6,0.64,1");

const BUTTON_SIZE = 32;

/* The dropdown CENTERED above the button, 14px over its top edge. */
const PANEL_WIDTH = 141;
const PANEL_HEIGHT = 134; /* 2×7 padding + 4 rows × 30 */
const PANEL_GAP = 14;
/* Button center in the panel's own coordinates — the drop grows out of it. */
const PANEL_ORIGIN_X = PANEL_WIDTH / 2; /* 70.5 */
const PANEL_ORIGIN_Y = PANEL_HEIGHT + PANEL_GAP + BUTTON_SIZE / 2; /* 164 */

/* Resting scale: the shrunk panel must hide inside the 16px-radius circle.
   Farthest corner ≈ √(70.5² + 164²) ≈ 179px from the origin → 179 × 0.08 ≈ 14. */
const PANEL_REST_SCALE = 0.08;

/* Blur discipline. The dropdown grows out of (and dives into) the button it
   overlaps — one mass, no far necks — so a light blur carries the look.
   The grab sits at the same σ as the speed dial's: its chain overlaps
   geometrically, so it needs no more blur than this to read as liquid, and
   less blur is less curvature shrink on the circle while it is only held. */
const GOO_BLUR_ACTIVE = 5;
const GOO_BLUR_REST = 1;
const GOO_BLUR_GRAB = 5;

/* Goo canvas geometry — must mirror .goo in the stylesheet.
   Every side needs room for the longest thing the liquid can do: a finger
   pulled the full GRAB_MAX (44) plus its head's radius (11 × 0.85 ≈ 9) plus
   the blur's tail (three σ, 15px) ≈ 68px measured from the button's edge. The
   canvas is what the browser rasterizes into, so anything past it is cut off
   with a straight edge and no rim — which is exactly what a finger pulled
   downwards used to hit, 44px below the button. 72px, everywhere. */
const GOO_WIDTH = 320;
const GOO_HEIGHT = 308;
const TRIGGER_X = 144; /* button left edge in goo coords */
const TRIGGER_Y = 204; /* button top edge */
const TRIGGER_CX = TRIGGER_X + BUTTON_SIZE / 2;
const TRIGGER_CY = TRIGGER_Y + BUTTON_SIZE / 2;

/* The PlayStation four — circle, cross, triangle, square — each wearing its
   button's hue (liquid/hues.ts), the
   same language the speed dial's satellites speak: which shape the finger
   has reached is the one thing the light is for. */
const ITEMS = [
  { id: "add-circle", label: "Circle", path: ICON_PATHS.circle, hue: SHAPE_HUES.circle },
  { id: "add-cross", label: "Cross", path: ICON_PATHS.cross, hue: SHAPE_HUES.cross },
  { id: "add-triangle", label: "Triangle", path: ICON_PATHS.triangle, hue: SHAPE_HUES.triangle },
  { id: "add-square", label: "Square", path: ICON_PATHS.square, hue: SHAPE_HUES.square },
] as const;

const PANEL_RADIUS = 16;

/* The panel's rect in goo-canvas coordinates — the seam engine measures the
   pulled finger against this rounded wall. */
const PANEL_GOO_X = TRIGGER_CX - PANEL_WIDTH / 2;
const PANEL_GOO_Y = TRIGGER_Y - PANEL_GAP - PANEL_HEIGHT;
const PANEL_PADDING = 7;
const ROW_HEIGHT = 30;

/* Which row a joint belongs to: the one whose center is nearest the contact
   point. Rows are full-width, so their vertical centers are the whole
   difference — a touch along the panel's bottom edge lands on the last row, a
   touch climbing a side edge walks up through the stack. The panel only ever
   TRANSLATES while a grab is live, and its lean tops out around 6px — less
   than a quarter of a row — so the resting geometry is close enough to name
   the row without chasing the transform. */
function nearestRow(y: number) {
  const first = PANEL_GOO_Y + PANEL_PADDING + ROW_HEIGHT / 2;
  return Math.min(ITEMS.length - 1, Math.max(0, Math.round((y - first) / ROW_HEIGHT)));
}

/* The lit stretch of border at rest — the engine drives the real one. */
const SEAM_RADIUS = 20;

/* Two layers are enough here: only one pair exists (trigger|panel), so the
   second is the spare that lets a re-contact light up while the previous
   light is still dying. */
const SEAM_LAYERS = [0, 1];

export type LiquidAddTheme = "light" | "dark";

export interface LiquidAddProps {
  /* The frame the button is standing on — light by default. Same contract as
     the speed dial's: it only swaps the colour variables in the stylesheet;
     every spring, blur and threshold is the same one. */
  theme?: LiquidAddTheme;
}

export function LiquidAdd({ theme = "light" }: LiquidAddProps = {}) {
  const menuId = useId();
  const gooId = `liquid-add-goo-${useId().replace(/:/g, "")}`;
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
  const blobPanelRef = useRef<SVGPathElement>(null);
  const grabChainRefs = useRef<(SVGCircleElement | null)[]>([]);
  const triggerBodyRef = useRef<HTMLDivElement>(null);
  const panelBodyRef = useRef<SVGSVGElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  /* The rows' CONTENT (icon + label), animated separately from the rows: the
     entry stagger rides these, while the buttons — and the selection washes
     drawn on them — stay put inside the panel and scale with it as ONE mass.
     Staggering the buttons themselves tore a full-height selection run into
     four pieces with gaps between them for the length of every bounce. */
  const itemInnerRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const blurRef = useRef<SVGFEGaussianBlurElement>(null);
  const rimEdgeRef = useRef<SVGFEColorMatrixElement>(null);
  const innerEdgeRef = useRef<SVGFEColorMatrixElement>(null);
  const maskBlurRef = useRef<SVGFEGaussianBlurElement>(null);
  const maskRimEdgeRef = useRef<SVGFEColorMatrixElement>(null);
  const maskInnerEdgeRef = useRef<SVGFEColorMatrixElement>(null);
  const seamGradientRefs = useRef<(SVGRadialGradientElement | null)[]>([]);
  const seamPaintRefs = useRef<(SVGRectElement | null)[]>([]);
  const seamStopRefs = useRef<(SVGStopElement | null)[][]>([]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const stretchRef = useRef<LiquidStretch | null>(null);
  /* The row-press squish, kept on a handle. It tweens the SAME property the
     open and close runs do (the panel's scale) and rings for half a second,
     so left loose it can still be writing while a toggle is trying to pour
     or collapse — two owners, one property, and whichever ticks last wins
     the frame. */
  const pressTweenRef = useRef<gsap.core.Tween | null>(null);
  const seamRef = useRef<LiquidSeam | null>(null);
  /* Whose border the grab is currently stretching — the finger's beads belong
     to it, so they cannot light a joint against their own body. */
  const grabbedOwnerRef = useRef("trigger");
  /* Which row each seam layer is painted for, and which row's glyph is lit —
     so styles are written only on a change, never every tick. */
  const layerRowRef = useRef<(number | null)[]>([]);
  const litRowRef = useRef<number | null>(null);
  /* Mirrors isOpen for the stretch engine's host callbacks, which are created
     once and must not close over a stale render's state. */
  const isOpenRef = useRef(false);
  /* Same reason: the voice asks which frame it is speaking in, and the host
     callbacks outlive the render that made them. */
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const [isOpen, setIsOpen] = useState(false);
  /* Multi-select: which rows are ticked. Persists across open/close — a
     selection is a state, not a gesture. */
  const [selected, setSelected] = useState<boolean[]>(() => ITEMS.map(() => false));
  /* Which row the pointer is on — the travelling hover's only input. */
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  /* Each row's motif hue on the frame we are standing on — null on the
     light frame, which carries no PlayStation colour. */
  const rowHues = ITEMS.map((item) => motifHue(item.hue, theme));

  const getTriggerBits = useCallback(
    () => [blobTriggerRef.current, triggerBodyRef.current, iconRef.current],
    [],
  );

  const getPanelTrio = useCallback(
    () => [blobPanelRef.current, panelBodyRef.current, panelRef.current],
    [],
  );

  /* Blur + rim thresholds are ONE setting — see liquid/goo.ts. The mask
     carves its rim out of the same blur with the same pair of thresholds — a
     mask one setting behind would let the colour slip off the border it is
     supposed to be painted on. */
  const applyGooBlur = useCallback((blur: number, tl?: gsap.core.Timeline, at = 0) => {
    setGooBlur(
      { blur: blurRef.current, rim: rimEdgeRef.current, inner: innerEdgeRef.current },
      blur,
      tl,
      at,
    );
    setGooBlur(
      { blur: maskBlurRef.current, rim: maskRimEdgeRef.current, inner: maskInnerEdgeRef.current },
      blur,
      tl,
      at,
    );
  }, []);

  /* Exactly ONE shadow at any moment — the speed dial's rule. The goo casts
     its own while it owns the picture; the crisp bodies carry theirs on their
     container. At a handoff the bodies snap visible UNDER the still-opaque
     goo, so for the goo's fade both would cast — a doubled shadow that pulses
     dark. The goo's shadow switches off in the SAME frame the bodies snap on. */
  const setGooShadow = useCallback((on: boolean) => {
    if (gooRef.current) {
      gooRef.current.style.filter = on ? "var(--liquid-goo-shadow)" : "none";
    }
  }, []);

  const liquidOn = useCallback(
    (blur: number) => {
      setGooShadow(true);
      gsap.set(gooRef.current, { autoAlpha: 1 });
      gsap.set(bodiesRef.current, { autoAlpha: 0 });
      applyGooBlur(blur);
      rootRef.current?.setAttribute("data-liquid", "");
    },
    [applyGooBlur, setGooShadow],
  );

  /* The neon catch, cleared: a row lit by a completed merge lets go the
     moment the picture is no longer the gesture's. */
  const clearRowNeon = useCallback(() => {
    litRowRef.current = null;
    itemRefs.current.forEach((item) => {
      if (item) {
        item.style.color = "";
        item.style.filter = "";
      }
    });
  }, []);

  /* The engines are created ONCE and live in refs, so any behaviour handed to
     them directly would be frozen at the first render — stale after a theme
     change. These refs are reassigned EVERY render, and the engines call
     through them, so the newest code always answers. */

  /* The joint takes the hue of the ROW nearest the touch — the dropdown's
     reading of the dial's satellite colours. Only ever one pair here
     (trigger|panel), so which row was reached is the whole message. */
  const seamPaintFnRef = useRef<(index: number, at: { x: number; y: number }) => void>(() => {});
  seamPaintFnRef.current = (index, at) => {
    const stops = seamStopRefs.current[index];
    if (!stops) {
      return;
    }
    const row = nearestRow(at.y);
    layerRowRef.current[index] = row;
    /* Light: no motif, so the joint falls back to the stylesheet's own seam
       colour and reads as one uniform light instead of naming a row. */
    const hue = motifHue(ITEMS[row].hue, theme);
    const paint = hue === null ? "var(--liquid-seam)" : seamHue(hue, theme);
    stops.forEach((stop) => stop?.setAttribute("stop-color", paint));
  };

  /* The joint can roll along the panel's edge without ever changing pair, so
     the hue follows the nearest row while lit — repainted only when the
     answer genuinely changes, so the colour snaps exactly at a row boundary
     and nowhere else. */
  const seamRepaintFnRef = useRef<(index: number, at: { x: number; y: number }) => void>(() => {});
  seamRepaintFnRef.current = (index, at) => {
    if (layerRowRef.current[index] !== nearestRow(at.y)) {
      seamPaintFnRef.current(index, at);
    }
  };

  /* Neon rows. A touch shows ONLY the border gradient. Once the merge
     completes (the engine's `joined`), the nearest row catches its own hue
     with a soft bloom — glyph and label together, since a row IS its label.
     Styles are written only on a state change; the CSS transition breathes. */
  const jointsFnRef = useRef<(joints: SeamJoint[]) => void>(() => {});
  jointsFnRef.current = (joints) => {
    let lit: number | null = null;
    joints.forEach((joint) => {
      if (!joint.joined) {
        return;
      }
      /* A fully swallowed contact reports no position — the light stays on
         whatever row it last named, through the deepest point of the merge. */
      lit = joint.y !== undefined ? nearestRow(joint.y) : litRowRef.current;
    });

    if (lit === litRowRef.current) {
      return;
    }
    litRowRef.current = lit;
    itemRefs.current.forEach((item, index) => {
      if (!item) {
        return;
      }
      /* No motif on the light frame: a merge shows in the border alone. */
      const hue = motifHue(ITEMS[index].hue, theme);
      const on = hue !== null && index === lit;
      item.style.color = on ? hue : "";
      item.style.filter = on && hue ? neonGlow(hue) : "";
    });
  };

  useEffect(() => {
    gsap.set(getPanelTrio(), {
      scale: PANEL_REST_SCALE,
      rotation: -3,
      transformOrigin: `${PANEL_ORIGIN_X}px ${PANEL_ORIGIN_Y}px`,
    });
    gsap.set([panelBodyRef.current, panelRef.current], { autoAlpha: 0 });
    gsap.set(itemInnerRefs.current, { autoAlpha: 0 });
    gsap.set(blobTriggerRef.current, { transformOrigin: "50% 50%" });
    gsap.set(grabChainRefs.current, { scale: 0, transformOrigin: "50% 50%" });
    gsap.set(gooRef.current, { autoAlpha: 0 });
    gsap.set(bodiesRef.current, { autoAlpha: 1 });

    /* The engine runs on BOTH frames — see the speed dial for why: its
       report is not only paint, and the light frame hides the wash in the
       stylesheet rather than by going blind. */
    seamRef.current?.start();

    return () => {
      timelineRef.current?.kill();
      pressTweenRef.current?.kill();
      stretchRef.current?.kill();
      seamRef.current?.kill();
    };
    /* Mount only — see the speed dial: a re-run re-parks the panel at rest
       while `isOpen` still says open. */
  }, [getPanelTrio]);

  const setStaticState = useCallback(
    (open: boolean) => {
      gsap.set(getPanelTrio(), {
        scale: open ? 1 : PANEL_REST_SCALE,
        rotation: open ? 0 : -3,
        x: 0,
        y: 0,
      });
      gsap.set([panelBodyRef.current, panelRef.current], { autoAlpha: open ? 1 : 0 });
      panelRef.current?.removeAttribute("data-wash");
      gsap.set(panelRef.current, { "--sel-alpha": 1 });
      gsap.set(blobPanelRef.current, { autoAlpha: 1 });
      gsap.set(itemInnerRefs.current, { autoAlpha: open ? 1 : 0, y: 0 });
      gsap.set(getTriggerBits(), { scale: 1, x: 0, y: 0 });
      gsap.set(iconRef.current, { rotation: open ? 135 : 0 });
      gsap.set(gooRef.current, { autoAlpha: 0 });
      gsap.set(bodiesRef.current, { autoAlpha: 1 });
      clearRowNeon();
      rootRef.current?.removeAttribute("data-liquid");
      rootRef.current?.removeAttribute("data-grab");
    },
    [clearRowNeon, getPanelTrio, getTriggerBits],
  );

  const clearInlineFills = useCallback(() => {
    [blobTriggerRef.current, blobPanelRef.current, ...grabChainRefs.current].forEach((blob) =>
      blob?.removeAttribute("fill"),
    );
  }, []);

  /* The grab is the family's ONE shared gesture (liquid/stretch.ts) — the
     speed dial's, verbatim. This component only tells the engine which pieces
     make up its picture and how to switch its goo on and hand it back off. */
  if (stretchRef.current === null) {
    stretchRef.current = createLiquidStretch({
      buttonSize: BUTTON_SIZE,
      auxLean: 0.14,
      anchor: () => rootRef.current,
      triggerBits: getTriggerBits,
      triggerStretchBits: () => [blobTriggerRef.current, triggerBodyRef.current],
      triggerIcon: () => iconRef.current,
      chain: () => grabChainRefs.current,
      auxTrio: () => getPanelTrio(),
      liquidOn: (target) => {
        grabbedOwnerRef.current = target === "trigger" ? "trigger" : "panel";
        liquidOn(GOO_BLUR_GRAB);
        /* data-grab gates the seam: this light is a gesture's feedback, not a
           state the component wears at rest. */
        rootRef.current?.setAttribute("data-grab", "");
        gooSfx.play("grab", { frame: themeRef.current });

        /* A grab that lands MID-FLIGHT takes the picture over: the open/close
           run would otherwise hand the picture back to the crisp bodies a few
           hundred milliseconds into the gesture and take the liquid with it.
           Killed, then walked to wherever it was heading, so nothing is
           stranded half-open. */
        if (timelineRef.current?.isActive()) {
          timelineRef.current.kill();
          const settled = isOpenRef.current;
          /* ON the component's own timeline, not as loose tweens. openMenu and
             closeMenu begin by killing exactly this reference; tweens started
             outside it survive that kill and keep writing toward the state the
             interrupted run was heading for — which is how a click that
             reopened mid-close ended with the panel set visible and then
             dragged back to nothing a tenth of a second later. */
          const settle = gsap.timeline();
          timelineRef.current = settle;
          settle.to(
            getPanelTrio(),
            {
              scale: settled ? 1 : PANEL_REST_SCALE,
              rotation: settled ? 0 : -3,
              duration: 0.16,
              ease: OUT_STRONG,
              overwrite: "auto",
            },
            0,
          );
          settle.to(
            [panelBodyRef.current, panelRef.current],
            { autoAlpha: settled ? 1 : 0, duration: 0.12, ease: OUT_STRONG, overwrite: "auto" },
            0,
          );
          settle.to(
            itemInnerRefs.current,
            { autoAlpha: settled ? 1 : 0, y: 0, duration: 0.12, ease: OUT_STRONG, overwrite: "auto" },
            0,
          );
          settle.to(
            iconRef.current,
            { rotation: settled ? 135 : 0, duration: 0.16, ease: OUT_STRONG, overwrite: "auto" },
            0,
          );
        }
        /* The shrunk panel parks INSIDE the circle while the menu is closed —
           and it must sit the grab out: it cannot ride the trigger's lean, so
           left in the goo it pokes out of the moving silhouette as a hump.
           That hump is what made this stretch look broken next to the speed
           dial's (whose hidden satellites are too small to surface).
           openMenu/closeMenu re-arm the alpha. */
        gsap.set(blobPanelRef.current, {
          autoAlpha: target === "trigger" && !isOpenRef.current ? 0 : 1,
        });
      },
      handoff: (tl, at) => {
        gooSfx.play("release", { frame: themeRef.current });
        /* The crisp bodies SNAP on underneath the still-opaque goo — the two
           pictures are identical, so nothing changes on screen — and only the
           goo fades. The goo's shadow hands over to the bodies' in the same
           frame, so the shadow never doubles during the fade. */
        tl.set(bodiesRef.current, { autoAlpha: 1 }, at);
        tl.call(() => setGooShadow(false), undefined, at);
        tl.to(gooRef.current, { autoAlpha: 0, duration: 0.15, ease: "power1.out" }, at);
        applyGooBlur(GOO_BLUR_REST, tl, at + 0.16);
        tl.call(() => setGooShadow(true), undefined, at + 0.16);
        tl.call(
          () => {
            rootRef.current?.removeAttribute("data-liquid");
            rootRef.current?.removeAttribute("data-grab");
            clearInlineFills();
            clearRowNeon();
          },
          undefined,
          at + 0.15,
        );
      },
    });
  }
  const stretch = stretchRef.current;

  if (seamRef.current === null) {
    seamRef.current = createLiquidSeam({
      anchor: () => rootRef.current,
      parts: () => [
        { blob: blobTriggerRef.current, owner: "trigger" },
        {
          blob: blobPanelRef.current,
          owner: "panel",
          rect: {
            x: PANEL_GOO_X,
            y: PANEL_GOO_Y,
            width: PANEL_WIDTH,
            height: PANEL_HEIGHT,
            radius: PANEL_RADIUS,
          },
        },
        ...grabChainRefs.current.map((blob) => ({ blob, owner: grabbedOwnerRef.current })),
      ],
      layers: () =>
        SEAM_LAYERS.map((_, index) => ({
          gradient: seamGradientRefs.current[index] ?? null,
          paint: seamPaintRefs.current[index] ?? null,
        })),
      paint: (index, _owner, at) => seamPaintFnRef.current(index, at),
      repaint: (index, _owner, at) => seamRepaintFnRef.current(index, at),
      joints: (joints) => jointsFnRef.current(joints),
    });
  }

  /* A press on a row is felt by the WHOLE dropdown: the liquid mass gives a
     touch — sinking toward the button it hangs from — and springs back to
     its own shape the moment the finger lets go. Crisp transforms, no goo:
     the deformation is a couple of percent, and the border under it never
     changes. */
  const pressPanel = useCallback(() => {
    if (prefersReducedMotion()) {
      return;
    }
    pressTweenRef.current?.kill();
    pressTweenRef.current = gsap.to(getPanelTrio(), {
      scaleX: 0.985,
      scaleY: 0.96,
      duration: 0.12,
      ease: OUT_STRONG,
      overwrite: "auto",
    });
  }, [getPanelTrio]);

  const releasePanelPress = useCallback(() => {
    if (prefersReducedMotion()) {
      return;
    }
    pressTweenRef.current?.kill();
    pressTweenRef.current = gsap.to(getPanelTrio(), {
      scaleX: 1,
      scaleY: 1,
      duration: 0.55,
      ease: SPRING,
      overwrite: "auto",
    });
  }, [getPanelTrio]);

  const handleItemPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) {
        return;
      }
      pressPanel();
      /* The window backstop, not the row: the release must land wherever the
         pointer lets go, even far outside the button. */
      window.addEventListener("pointerup", releasePanelPress, { once: true });
      window.addEventListener("pointercancel", releasePanelPress, { once: true });
    },
    [pressPanel, releasePanelPress],
  );

  const openMenu = useCallback(() => {
    timelineRef.current?.kill();
    pressTweenRef.current?.kill();
    stretch.kill();
    isOpenRef.current = true;
    setIsOpen(true);

    if (prefersReducedMotion()) {
      setStaticState(true);
      return;
    }

    clearInlineFills();
    clearRowNeon();
    gooSfx.play("open", { frame: theme });
    liquidOn(GOO_BLUR_ACTIVE);
    rootRef.current?.removeAttribute("data-grab");
    const triggerBits = getTriggerBits();
    const tl = gsap.timeline();
    timelineRef.current = tl;

    tl.set([panelBodyRef.current, panelRef.current], { autoAlpha: 1 }, 0);
    /* A run that was already ticked waits for its panel to ARRIVE. Lighting
       it from the first frame means the wash rides the whole pour — stretched
       and skewed with the shape it is painted on — and the panel appears to
       open already-used. It comes up once the shape has landed, so what you
       see is the dropdown, and then what is in it. */
    tl.call(() => panelRef.current?.setAttribute("data-wash", ""), undefined, 0);
    tl.set(panelRef.current, { "--sel-alpha": 0 }, 0);
    tl.to(panelRef.current, { "--sel-alpha": 1, duration: 0.22, ease: "power2.out" }, 0.2);
    tl.call(() => panelRef.current?.removeAttribute("data-wash"), undefined, 0.44);
    /* Re-arm the panel blob a closed-state grab may have hidden. */
    tl.set(blobPanelRef.current, { autoAlpha: 1 }, 0);
    tl.set(getPanelTrio(), { x: 0, y: 0 }, 0);
    tl.set([blobTriggerRef.current, triggerBodyRef.current], { rotation: 0 }, 0);
    tl.to(
      grabChainRefs.current,
      { x: 0, y: 0, scale: 0, duration: 0.14, ease: OUT_STRONG, overwrite: "auto" },
      0,
    );

    /* The button swells as the drop gathers, then shakes it off... */
    tl.to(triggerBits, { x: 0, y: 0, scale: 1.16, duration: 0.13, ease: OUT_STRONG }, 0);
    tl.to(triggerBits, { scale: 1, duration: 0.34, ease: SPRING }, 0.15);
    /* ...the plus spins itself into an × on the house spring... */
    tl.to(iconRef.current, { rotation: 135, duration: 0.34, ease: SPRING }, 0.02);

    /* ...and the dropdown oozes out, then fires on the pop spring — swinging
       upright from its resting tilt, jelly phase-lag included. */
    const trio = getPanelTrio();
    tl.to(trio, { scale: 0.42, duration: 0.14, ease: "power1.inOut" }, 0.03);
    tl.to(trio, { scaleY: 1, rotation: 0, duration: 0.26, ease: POP }, 0.17);
    tl.to(trio, { scaleX: 1, duration: 0.26, ease: POP }, 0.2);

    /* Rows condense bottom-up — the direction the drop grew. */
    /* The rows RISE only when they are actually away. A hard fromTo blanks
       them first, and on a reopen that interrupts a close — the rows still
       half on screen — that reads as the panel opening EMPTY and standing
       there until the entry beat comes round. Cold open: they are at nothing
       anyway, so the authored rise is unchanged. Warm: they simply finish
       coming up from wherever the interrupted close left them. */
    if (Number(gsap.getProperty(itemInnerRefs.current[0], "opacity")) < 0.05) {
      tl.set(itemInnerRefs.current, { autoAlpha: 0, y: 12 }, 0);
    }
    tl.to(
      itemInnerRefs.current,
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.19,
        ease: BACK_OUT,
        stagger: { each: 0.03, from: "end" },
      },
      0.2,
    );

    /* Hand back to the crisp picture at full blur — no rim thinning. The
       bodies snap on UNDER the still-opaque goo; the shadow changes hands in
       the same frame (see setGooShadow). */
    tl.set(bodiesRef.current, { autoAlpha: 1 }, 0.47);
    tl.call(() => setGooShadow(false), undefined, 0.47);
    tl.to(gooRef.current, { autoAlpha: 0, duration: 0.16, ease: "power1.out" }, 0.47);
    applyGooBlur(GOO_BLUR_REST, tl, 0.64);
    tl.call(() => setGooShadow(true), undefined, 0.64);
    tl.call(() => rootRef.current?.removeAttribute("data-liquid"), undefined, 0.63);
  }, [applyGooBlur, clearInlineFills, clearRowNeon, getPanelTrio, getTriggerBits, liquidOn, setGooShadow, setStaticState, stretch]);

  const closeMenu = useCallback(
    (fromTrigger: boolean) => {
      timelineRef.current?.kill();
      pressTweenRef.current?.kill();
      stretch.kill();
      isOpenRef.current = false;
      setIsOpen(false);

      if (prefersReducedMotion()) {
        setStaticState(false);
        return;
      }

      clearInlineFills();
      clearRowNeon();
      gooSfx.play("close", { frame: theme });
      liquidOn(GOO_BLUR_ACTIVE);
      rootRef.current?.removeAttribute("data-grab");
      const triggerBits = getTriggerBits();
      const tl = gsap.timeline();
      timelineRef.current = tl;

      /* Re-arm the panel blob a closed-state grab may have hidden. */
      tl.set(blobPanelRef.current, { autoAlpha: 1 }, 0);
      /* The selection wash goes out FIRST — the panel must be plain before it
         folds into the circle. */
      tl.call(() => panelRef.current?.setAttribute("data-wash", ""), undefined, 0);
      tl.to(panelRef.current, { "--sel-alpha": 0, duration: 0.11, ease: "power2.in" }, 0);
      tl.to(iconRef.current, { rotation: 0, duration: 0.22, ease: SPRING }, 0);
      tl.set([blobTriggerRef.current, triggerBodyRef.current], { rotation: 0 }, 0);
      tl.to(triggerBits, { x: 0, y: 0, duration: 0.1, ease: OUT_STRONG }, 0);
      tl.to(
        grabChainRefs.current,
        { x: 0, y: 0, scale: 0, duration: 0.1, ease: OUT_STRONG, overwrite: "auto" },
        0,
      );

      /* One fast dive: the drop crashes ONTO the button (a flash of merged
         mass around 90ms), gets drunk in immediately, and the splat carries
         the rest of the story. */
      const trio = getPanelTrio();
      tl.to(trio, { x: 0, y: 0, duration: 0.1, ease: OUT_STRONG }, 0);
      tl.to(trio, { scaleX: 0.35, duration: 0.08, ease: MORPH }, 0);
      tl.to(trio, { scaleY: 0.35, rotation: -3, duration: 0.08, ease: MORPH }, 0.015);
      tl.to(
        itemInnerRefs.current,
        { autoAlpha: 0, y: 4, duration: 0.05, ease: "power1.in", stagger: 0.005 },
        0,
      );
      tl.to(trio, { scale: PANEL_REST_SCALE, y: 6, duration: 0.06, ease: "power2.in" }, 0.1);
      tl.set(trio, { y: 0 }, 0.17);
      tl.set([panelBodyRef.current, panelRef.current], { autoAlpha: 0 }, 0.17);

      if (fromTrigger) {
        tl.to(triggerBits, { scale: 1, duration: 0.1, ease: SPRING }, 0);
      }

      tl.to(
        triggerBits,
        {
          keyframes: [
            { scaleX: 1.18, scaleY: 0.84, duration: 0.05, ease: "power2.out" },
            { scaleX: 0.95, scaleY: 1.06, duration: 0.07, ease: "power1.inOut" },
            { scaleX: 1, scaleY: 1, duration: 0.24, ease: SPRING },
          ],
          overwrite: "auto",
        },
        0.14,
      );

      tl.set(bodiesRef.current, { autoAlpha: 1 }, 0.22);
      tl.call(() => setGooShadow(false), undefined, 0.22);
      tl.to(gooRef.current, { autoAlpha: 0, duration: 0.1, ease: "power1.out" }, 0.22);
      applyGooBlur(GOO_BLUR_REST, tl, 0.33);
      tl.call(() => setGooShadow(true), undefined, 0.33);
      tl.call(() => rootRef.current?.removeAttribute("data-liquid"), undefined, 0.32);
    },
    [applyGooBlur, clearInlineFills, clearRowNeon, getPanelTrio, getTriggerBits, liquidOn, setGooShadow, setStaticState, stretch],
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

  /* Grabbing the panel: same sponge, measured from the grab point itself.
     But NOT from a row — a press there is a selection gesture: the pointer
     capture a grab takes would retarget the click to the panel and the row
     would never hear it (which is exactly what made rows feel dead: press,
     a slight lean, release, nothing). Rows press; the panel's own padding
     grabs. */
  const handlePanelPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isOpen) {
        return;
      }
      if ((event.target as Element).closest('[role="menuitemcheckbox"]')) {
        return;
      }
      const anchorRect = rootRef.current?.getBoundingClientRect();
      if (!anchorRect) {
        return;
      }
      stretch.beginGrab(0, event, {
        x: event.clientX - (anchorRect.left + BUTTON_SIZE / 2),
        y: event.clientY - (anchorRect.top + BUTTON_SIZE / 2),
      });
    },
    [isOpen, stretch],
  );

  const handleGrabPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => stretch.pointerMove(event),
    [stretch],
  );

  /* A row click TOGGLES its tick — the menu stays up: multi-select means
     the conversation is not over after one answer. Outside click and Escape
     still close. */
  const handleItemClick = useCallback(
    (index: number) => {
      if (stretch.consumeClick()) {
        return;
      }
      gooSfx.play("tick", { frame: theme });
      setSelected((prev) => prev.map((on, at) => (at === index ? !on : on)));
    },
    [stretch],
  );

  /* A panel can open UNDER a cursor that never moves — no enter event is
     ever fired, so the travelling pill would sit dark under a row whose
     glyph is already lit by CSS :hover. The DOM knows who is hovered; ask
     it once, the moment the rows exist. */
  useEffect(() => {
    if (!isOpen) {
      setHoveredRow(null);
      return;
    }
    const row = panelRef.current?.querySelector<HTMLElement>(
      '[role="menuitemcheckbox"]:hover',
    );
    if (row?.dataset.rowIndex) {
      setHoveredRow(Number(row.dataset.rowIndex));
    }
  }, [isOpen]);

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
    <div ref={rootRef} className={styles.anchor} data-theme={theme}>
      {/* Layer 0: the full-set burst — painted BEFORE every body, so its
          glyph pieces fly BEHIND the dropdown: the panel itself is the
          curtain they leap from and dive back behind. */}
      <SelectionBurst
        active={selected.every(Boolean)}
        open={isOpen}
        theme={theme}
        panel={{
          left: -(PANEL_WIDTH - BUTTON_SIZE) / 2,
          bottom: 46,
          width: PANEL_WIDTH,
          height: PANEL_HEIGHT,
        }}
      />

      {/* Layer 1: crisp bodies — the resting picture. */}
      <div ref={bodiesRef} className={styles.bodies} aria-hidden="true">
        <div ref={triggerBodyRef} className={styles.triggerBody} />
        <svg
          ref={panelBodyRef}
          className={styles.panelBody}
          width={PANEL_WIDTH}
          height={PANEL_HEIGHT}
          viewBox={`0 0 ${PANEL_WIDTH} ${PANEL_HEIGHT}`}
          focusable="false"
        >
          <path
            className={styles.panelBodyShape}
            d={squirclePath(0.5, 0.5, PANEL_WIDTH - 1, PANEL_HEIGHT - 1, PANEL_RADIUS)}
          />
        </svg>
      </div>

      {/* Layer 2: the liquid. */}
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
              measured off whatever the blobs currently occupy, and at rest
              that is one 32px circle: 15% of it is ~5px of margin, while the
              grab blur needs three σ — 15px — before its tail reaches zero.
              Everything past that margin was cut off, so a pulled finger lost
              the soft outside of its head and its rim died on a straight
              edge — the drop looked dented, and the button with it. It also
              moved: the box grows as the finger extends, so the crop crawled
              while you dragged. A fixed region does neither. */}
          <filter
            id={gooId}
            filterUnits="userSpaceOnUse"
            x="0"
            y="0"
            width={GOO_WIDTH}
            height={GOO_HEIGHT}
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur
              ref={blurRef}
              in="SourceGraphic"
              stdDeviation={GOO_BLUR_REST}
              result="blur"
            />
            {/* The outer contour IS the border's outer edge; the inner one is
                a hair inside it, and the sliver between them is the rim that
                stands in for the 1px CSS border. Both offsets ride
                GOO_THRESHOLDS — they are re-solved for every blur the liquid
                runs at, so the border keeps its weight and its place whether
                the button is resting, opening or being pulled. */}
            <feColorMatrix
              ref={rimEdgeRef}
              in="blur"
              type="matrix"
              values={gooThreshold(GOO_RIM_THRESHOLDS[GOO_BLUR_REST][0])}
              result="goo"
            />
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
              — the hue can then be laid over the rim without ever spilling
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

          {/* The joint's paint: the touched row's colour at the seam, dying
              out by OPACITY along each border — the rim's own colour simply
              shows through where the light ends, so the walk out of a joint is
              always clean hue over rim, never a muddy mix of the two. */}
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
            {GRAB_CHAIN.map((link) => (
              <circle
                key={link.follow}
                ref={(el) => {
                  grabChainRefs.current[GRAB_CHAIN.indexOf(link)] = el;
                }}
                className={styles.blob}
                cx={TRIGGER_CX}
                cy={TRIGGER_CY}
                r={11}
              />
            ))}
            <path
              ref={blobPanelRef}
              className={styles.blob}
              d={squirclePath(PANEL_GOO_X, PANEL_GOO_Y, PANEL_WIDTH, PANEL_HEIGHT, PANEL_RADIUS)}
            />
          </g>
        </g>

        {/* The hue rides the border itself: a full-canvas wash of the seam
            gradient, cut down to the rim by the mask. Its opacity is the
            engine's only output — where the joint is and how strong it is are
            in the gradient's own center and radius. */}
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

      {/* Layer 3: rows and hit areas above the liquid. */}
      <div
        id={menuId}
        ref={panelRef}
        className={styles.panel}
        role="menu"
        aria-label="Shapes menu"
        inert={!isOpen}
        onPointerDown={handlePanelPointerDown}
        onPointerMove={handleGrabPointerMove}
        onPointerUp={releasePress}
        onPointerCancel={releasePress}
        onPointerLeave={() => setHoveredRow(null)}
      >
        {/* The hover travels UNDER the rows — one highlight for the list, not
            a state painted on each row. */}
        <RowHover index={hoveredRow} rowHeight={ROW_HEIGHT} inset={PANEL_PADDING} />

        {ITEMS.map((item, index) => (
          <button
            key={item.id}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            type="button"
            role="menuitemcheckbox"
            aria-checked={selected[index]}
            data-selected={selected[index] ? "" : undefined}
            className={styles.item}
            style={rowSelectionStyle(selected, index, rowHues)}
            data-row-index={index}
            onClick={() => handleItemClick(index)}
            onPointerDown={handleItemPointerDown}
            onPointerEnter={() => setHoveredRow(index)}
            /* Enter alone is not enough: a pointer that never crossed a
               boundary (it was already here, or it came back from a drag)
               fires none. Setting the same index again is free — React
               bails on an unchanged value. */
            onPointerMove={() => setHoveredRow(index)}
          >
            {/* The content rides its own wrapper: the entry stagger animates
                THIS, never the button — the selection wash lives on the
                button and must stay one piece with its neighbours. */}
            <span
              ref={(el) => {
                itemInnerRefs.current[index] = el;
              }}
              className={styles.itemInner}
            >
              <IconMorph shape={item.path} checked={selected[index]} className={styles.itemIcon} />
              <span className={styles.itemLabel}>{item.label}</span>
            </span>
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
        aria-label="Add shape"
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
