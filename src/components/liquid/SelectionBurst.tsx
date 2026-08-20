/* The full-set burst — PlayStation's glyphs take a bow.

   The moment EVERY row is ticked (the washes fuse into one full-height run),
   a handful of glyph pieces LEAP out from behind the dropdown — circle,
   cross, square, triangle in their own hues, different sizes, spinning —
   hang for a breath, and dive back behind the panel and are gone.

   The trick is that nothing is masked: the pieces live on a layer painted
   UNDER the panel's body, so "emerging" and "hiding" are just positions —
   outside the panel's silhouette they exist, behind it they don't. The
   panel itself is the curtain.

   One-shot on the rising edge only: reopening a dropdown that was already
   full does not bow again. And the bow is pure PlayStation motif, so it
   belongs to the DARK frame alone — on the light frame the set completes in
   silence. ONE implementation for every dropdown. */

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";

import { ICON_PATHS } from "../LiquidMenu/icons";
import { SHAPE_HUES, motifHue } from "./hues";
import { gooSfx } from "./sfx";
import { prefersReducedMotion } from "./motion";
import { useLiquidTheme } from "./theme";
import styles from "./SelectionBurst.module.css";

/* The cast: seven pieces — the four glyphs with a few repeats — each with
   its own size and take-off heading (degrees, y up). Chosen, not random:
   a spread that frames the panel instead of a shapeless splatter. The
   randomness at play time is only jitter on top of these. */
const PIECES: readonly { shape: keyof typeof ICON_PATHS & keyof typeof SHAPE_HUES; size: number; angle: number }[] = [
  { shape: "circle", size: 14, angle: 152 },
  { shape: "cross", size: 18, angle: 88 },
  { shape: "square", size: 11, angle: 30 },
  { shape: "triangle", size: 15, angle: 118 },
  { shape: "cross", size: 9, angle: 58 },
  { shape: "square", size: 16, angle: 203 },
  { shape: "triangle", size: 10, angle: -22 },
];

export interface SelectionBurstProps {
  /* True while EVERY row is ticked — the burst fires on the rising edge. */
  active: boolean;
  /* True while the dropdown is open. A close mid-flight RECALLS the pieces:
     the curtain they live behind is collapsing, and glyphs left hanging over
     a closed button would be exactly the kind of orphan this family never
     shows — so they dive after the panel and are gone with it. */
  open: boolean;
  /* The panel's box in the host anchor's coordinates — the layer sits
     exactly on the panel, so the pieces' geometry is measured off the very
     curtain that hides them. */
  panel: { left: number; bottom: number; width: number; height: number };
}

export function SelectionBurst({ active, open, panel }: SelectionBurstProps) {
  /* The frame is the STAGE's, not a prop of its own: the burst is the one
     piece of the family that exists on only one of them. */
  const theme = useLiquidTheme();
  const pieceRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const timelinesRef = useRef<gsap.core.Timeline[]>([]);
  /* Armed with the CURRENT value, so a dropdown that mounts already-full
     stays quiet — the bow is for the moment of completion, not for showing
     up late. */
  const wasActiveRef = useRef(active);

  useLayoutEffect(() => {
    const was = wasActiveRef.current;
    wasActiveRef.current = active;
    /* No motif, no bow: the light frame carries no PlayStation colour and
       throws no PlayStation glyphs. The rising edge is still tracked, so
       switching frames never leaves a stale arm. */
    const hasMotif = motifHue(SHAPE_HUES.circle, theme) !== null;
    if (!active || was || !hasMotif || prefersReducedMotion()) {
      return;
    }

    timelinesRef.current.forEach((tl) => tl.kill());
    timelinesRef.current = [];
    gooSfx.play("cheer", { frame: theme });

    const hw = panel.width / 2;
    const hh = panel.height / 2;

    PIECES.forEach((piece, index) => {
      const el = pieceRefs.current[index];
      if (!el) {
        return;
      }

      /* Take-off heading with a little jitter, as a unit vector (y down). */
      const rad = ((piece.angle + (Math.random() - 0.5) * 18) * Math.PI) / 180;
      const ux = Math.cos(rad);
      const uy = -Math.sin(rad);
      /* Where the panel's edge lies along this heading — the piece must
         clear it by its own size plus some air to be SEEN. */
      const edge = 1 / Math.max(Math.abs(ux) / hw, Math.abs(uy) / hh);
      const out = edge + piece.size / 2 + 12 + Math.random() * 22;
      const spin = (Math.random() < 0.5 ? -1 : 1) * (220 + Math.random() * 320);

      const tl = gsap.timeline({ delay: index * 0.035 + Math.random() * 0.1 });
      timelinesRef.current.push(tl);

      /* From behind the curtain... */
      tl.set(el, { x: 0, y: 0, rotation: Math.random() * 90, scale: 0.4, autoAlpha: 1 }, 0);
      /* ...the LEAP: past the edge with a back-out fling, growing on the
         way, spinning the whole ride... */
      tl.to(el, { x: ux * out, y: uy * out, duration: 0.42, ease: "back.out(1.7)" }, 0);
      tl.to(el, { scale: 1, duration: 0.3, ease: "power2.out" }, 0);
      tl.to(el, { rotation: `+=${spin}`, duration: 1.0, ease: "power1.out" }, 0);
      /* ...a breath of float at the top... */
      tl.to(el, { y: `-=${5 + Math.random() * 7}`, duration: 0.2, ease: "power1.inOut" }, 0.42);
      /* ...and the dive home, swallowed by the panel. The fade is a
         backstop for shallow headings, not the effect. */
      tl.to(
        el,
        { x: ux * edge * 0.25, y: uy * edge * 0.25, scale: 0.5, duration: 0.3, ease: "power2.in" },
        0.62,
      );
      tl.set(el, { autoAlpha: 0 }, 0.94);
    });
  }, [active, panel.height, panel.width, theme]);

  /* The recall: the panel is diving into its button, so every piece still in
     the air abandons its flight and dives with it — down toward the panel's
     foot, shrinking, gone before the collapse lands. */
  useLayoutEffect(() => {
    if (open) {
      return;
    }
    /* Computed, not inline: gsap's autoAlpha shows an element with
       visibility:"inherit", and a piece that has never flown carries no
       inline styles at all — only the computed value tells the truth for
       every one of them. */
    const flying = pieceRefs.current.filter(
      (el): el is HTMLSpanElement =>
        el !== null && getComputedStyle(el).visibility === "visible",
    );
    if (flying.length === 0) {
      return;
    }
    timelinesRef.current.forEach((tl) => tl.kill());
    timelinesRef.current = [];
    gsap.to(flying, {
      x: 0,
      y: panel.height / 2,
      scale: 0.25,
      autoAlpha: 0,
      duration: 0.18,
      ease: "power2.in",
      stagger: 0.01,
      overwrite: "auto",
    });
  }, [open, panel.height]);

  useLayoutEffect(
    () => () => {
      timelinesRef.current.forEach((tl) => tl.kill());
    },
    [],
  );

  return (
    <div
      className={styles.layer}
      style={{
        left: panel.left,
        bottom: panel.bottom,
        width: panel.width,
        height: panel.height,
      }}
      aria-hidden="true"
    >
      {PIECES.map((piece, index) => (
        <span
          key={index}
          ref={(el) => {
            pieceRefs.current[index] = el;
          }}
          className={styles.piece}
          style={{
            width: piece.size,
            height: piece.size,
            marginLeft: -piece.size / 2,
            marginTop: -piece.size / 2,
            /* Light frame: no motif, so the glyphs fly in the surface's own
               icon ink — the bow is the SHAPES leaping, not the colours. */
            color: motifHue(SHAPE_HUES[piece.shape], theme) ?? "var(--liquid-icon)",
          }}
        >
          <svg width={piece.size} height={piece.size} viewBox="0 0 24 24" fill="none">
            <path
              d={ICON_PATHS[piece.shape]}
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      ))}
    </div>
  );
}
