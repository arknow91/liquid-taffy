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

import { FileIcon, ImageIcon, MusicIcon, PlusIcon } from "../LiquidMenu/icons";
import { GOO_RIM_THRESHOLDS, gooThreshold, setGooBlur } from "../liquid/goo";
import { HOUSE_SPRING_POINTS, POP_SPRING_POINTS, springEase } from "../liquid/springs";
import { squirclePath } from "../liquid/squircle";
import {
  GRAB_CHAIN,
  createLiquidStretch,
  prefersReducedMotion,
  type LiquidStretch,
  type StretchTarget,
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
const PANEL_HEIGHT = 104; /* 2×7 padding + 3 rows × 30 */
const PANEL_GAP = 14;
/* Button center in the panel's own coordinates — the drop grows out of it. */
const PANEL_ORIGIN_X = PANEL_WIDTH / 2; /* 70.5 */
const PANEL_ORIGIN_Y = PANEL_HEIGHT + PANEL_GAP + BUTTON_SIZE / 2; /* 134 */

/* Resting scale: the shrunk panel must hide inside the 16px-radius circle.
   Farthest corner ≈ √(70.5² + 134²) ≈ 151px from the origin → 151 × 0.08 ≈ 12. */
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

const ITEMS = [
  { id: "add-image", label: "Attach image", Icon: ImageIcon },
  { id: "add-audio", label: "Attach audio", Icon: MusicIcon },
  { id: "add-file", label: "Attach file", Icon: FileIcon },
] as const;

const PANEL_RADIUS = 16;

export function LiquidAdd() {
  const menuId = useId();
  const gooId = `liquid-add-goo-${useId().replace(/:/g, "")}`;
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
  const blurRef = useRef<SVGFEGaussianBlurElement>(null);
  const rimEdgeRef = useRef<SVGFEColorMatrixElement>(null);
  const innerEdgeRef = useRef<SVGFEColorMatrixElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const stretchRef = useRef<LiquidStretch | null>(null);
  /* Mirrors isOpen for the stretch engine's host callbacks, which are created
     once and must not close over a stale render's state. */
  const isOpenRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);

  const getTriggerBits = useCallback(
    () => [blobTriggerRef.current, triggerBodyRef.current, iconRef.current],
    [],
  );

  const getPanelTrio = useCallback(
    () => [blobPanelRef.current, panelBodyRef.current, panelRef.current],
    [],
  );

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

  const liquidOn = useCallback(
    (blur: number) => {
      gsap.set(gooRef.current, { autoAlpha: 1 });
      gsap.set(bodiesRef.current, { autoAlpha: 0 });
      applyGooBlur(blur);
      rootRef.current?.setAttribute("data-liquid", "");
    },
    [applyGooBlur],
  );

  useEffect(() => {
    gsap.set(getPanelTrio(), {
      scale: PANEL_REST_SCALE,
      rotation: -3,
      transformOrigin: `${PANEL_ORIGIN_X}px ${PANEL_ORIGIN_Y}px`,
    });
    gsap.set([panelBodyRef.current, panelRef.current], { autoAlpha: 0 });
    gsap.set(itemRefs.current, { autoAlpha: 0 });
    gsap.set(blobTriggerRef.current, { transformOrigin: "50% 50%" });
    gsap.set(grabChainRefs.current, { scale: 0, transformOrigin: "50% 50%" });
    gsap.set(gooRef.current, { autoAlpha: 0 });
    gsap.set(bodiesRef.current, { autoAlpha: 1 });

    return () => {
      timelineRef.current?.kill();
      stretchRef.current?.kill();
    };
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
      gsap.set(blobPanelRef.current, { autoAlpha: 1 });
      gsap.set(itemRefs.current, { autoAlpha: open ? 1 : 0, y: 0 });
      gsap.set(getTriggerBits(), { scale: 1, x: 0, y: 0 });
      gsap.set(iconRef.current, { rotation: open ? 135 : 0 });
      gsap.set(gooRef.current, { autoAlpha: 0 });
      gsap.set(bodiesRef.current, { autoAlpha: 1 });
      rootRef.current?.removeAttribute("data-liquid");
    },
    [getPanelTrio, getTriggerBits],
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
      grabbedBlobs: (target: StretchTarget) => [
        target === "trigger" ? blobTriggerRef.current : blobPanelRef.current,
      ],
      auxTrio: () => getPanelTrio(),
      liquidOn: (target) => {
        liquidOn(GOO_BLUR_GRAB);
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
        tl.to(gooRef.current, { autoAlpha: 0, duration: 0.15, ease: "power1.out" }, at);
        tl.to(bodiesRef.current, { autoAlpha: 1, duration: 0.15, ease: "power1.out" }, at);
        applyGooBlur(GOO_BLUR_REST, tl, at + 0.16);
        tl.call(
          () => {
            rootRef.current?.removeAttribute("data-liquid");
            clearInlineFills();
          },
          undefined,
          at + 0.15,
        );
      },
    });
  }
  const stretch = stretchRef.current;

  const openMenu = useCallback(() => {
    timelineRef.current?.kill();
    stretch.kill();
    isOpenRef.current = true;
    setIsOpen(true);

    if (prefersReducedMotion()) {
      setStaticState(true);
      return;
    }

    clearInlineFills();
    liquidOn(GOO_BLUR_ACTIVE);
    const triggerBits = getTriggerBits();
    const tl = gsap.timeline();
    timelineRef.current = tl;

    tl.set([panelBodyRef.current, panelRef.current], { autoAlpha: 1 }, 0);
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
    tl.fromTo(
      itemRefs.current,
      { autoAlpha: 0, y: 12 },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.19,
        ease: BACK_OUT,
        stagger: { each: 0.03, from: "end" },
      },
      0.2,
    );

    /* Hand back to the crisp picture at full blur — no rim thinning. */
    tl.to(gooRef.current, { autoAlpha: 0, duration: 0.16, ease: "power1.out" }, 0.47);
    tl.to(bodiesRef.current, { autoAlpha: 1, duration: 0.16, ease: "power1.out" }, 0.47);
    applyGooBlur(GOO_BLUR_REST, tl, 0.64);
    tl.call(() => rootRef.current?.removeAttribute("data-liquid"), undefined, 0.63);
  }, [applyGooBlur, clearInlineFills, getPanelTrio, getTriggerBits, liquidOn, setStaticState, stretch]);

  const closeMenu = useCallback(
    (fromTrigger: boolean) => {
      timelineRef.current?.kill();
      stretch.kill();
      isOpenRef.current = false;
      setIsOpen(false);

      if (prefersReducedMotion()) {
        setStaticState(false);
        return;
      }

      clearInlineFills();
      liquidOn(GOO_BLUR_ACTIVE);
      const triggerBits = getTriggerBits();
      const tl = gsap.timeline();
      timelineRef.current = tl;

      /* Re-arm the panel blob a closed-state grab may have hidden. */
      tl.set(blobPanelRef.current, { autoAlpha: 1 }, 0);
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
        itemRefs.current,
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

      tl.to(gooRef.current, { autoAlpha: 0, duration: 0.1, ease: "power1.out" }, 0.22);
      tl.to(bodiesRef.current, { autoAlpha: 1, duration: 0.1, ease: "power1.out" }, 0.22);
      applyGooBlur(GOO_BLUR_REST, tl, 0.33);
      tl.call(() => rootRef.current?.removeAttribute("data-liquid"), undefined, 0.32);
    },
    [applyGooBlur, clearInlineFills, getPanelTrio, getTriggerBits, liquidOn, setStaticState, stretch],
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

  /* Grabbing the panel: same sponge, measured from the grab point itself. */
  const handlePanelPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isOpen) {
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

  const handleItemClick = useCallback(() => {
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
        style={{ filter: "drop-shadow(0 3px 6.25px rgba(0, 0, 0, 0.08))" }}
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
            d={squirclePath(
              TRIGGER_CX - PANEL_WIDTH / 2,
              TRIGGER_Y - PANEL_GAP - PANEL_HEIGHT,
              PANEL_WIDTH,
              PANEL_HEIGHT,
              PANEL_RADIUS,
            )}
          />
        </g>
      </svg>

      {/* Layer 3: rows and hit areas above the liquid. */}
      <div
        id={menuId}
        ref={panelRef}
        className={styles.panel}
        role="menu"
        aria-label="Attach menu"
        inert={!isOpen}
        onPointerDown={handlePanelPointerDown}
        onPointerMove={handleGrabPointerMove}
        onPointerUp={releasePress}
        onPointerCancel={releasePress}
      >
        {ITEMS.map((item, index) => (
          <button
            key={item.id}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={handleItemClick}
          >
            <item.Icon className={styles.itemIcon} />
            <span>{item.label}</span>
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
        aria-label="Attach"
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
