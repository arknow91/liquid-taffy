/* PillTabs — the row of switches the alert banners use, lifted here whole.
 *
 * The selection is not painted on the buttons: one shared pill floats UNDER
 * the labels and GSAP carries it from tab to tab, going a little gelatinous on
 * the way — it stretches long and low as it takes off, leaning into the
 * direction of travel, then rings back to shape on an elastic once it lands.
 * Width tweens alongside x, so the pill is already becoming the next label's
 * size while it flies.
 *
 * It knows nothing about what it switches: it is handed items, the id that is
 * currently picked, and a callback. Its colours are the liquid family's own —
 * the pill wears the drops' surface and rim, the labels the stage's ink — so
 * it changes frame with everything around it and never carries a palette of
 * its own (see styles/tokens.css). */

import { useLayoutEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";

import { prefersReducedMotion } from "../liquid/motion";
import { gooSfx } from "../liquid/sfx";
import { useLiquidTheme } from "../liquid/theme";
import styles from "./PillTabs.module.css";

export type PillTabItem<Id extends string = string> = {
  id: Id;
  /* Usually a word. Anything a tab can carry is allowed — a mark beside the
     label, say — because the row measures whatever it renders. */
  label: ReactNode;
  /* Read by screen readers and by anything that needs the label as TEXT
     (a plain string label is its own name). */
  name?: string;
};

type PillTabsProps<Id extends string> = {
  items: readonly PillTabItem<Id>[];
  value: Id;
  onChange: (id: Id) => void;
  /* Names the row for screen readers — the tabs alone say what they switch to,
     not what they are switching. */
  label: string;
};

export function PillTabs<Id extends string>({ items, value, onChange, label }: PillTabsProps<Id>) {
  /* Only the VOICE asks which frame this is — the colours arrive on their
     own, inherited from the stage. */
  const theme = useLiquidTheme();
  const rowRef = useRef<HTMLDivElement | null>(null);
  const pillRef = useRef<HTMLSpanElement | null>(null);
  const tabRefs = useRef(new Map<Id, HTMLButtonElement>());
  /* What is picked right now, for the resize observer below — it is created
     once and must not close over a stale selection. */
  const valueRef = useRef(value);
  valueRef.current = value;

  useLayoutEffect(() => {
    const pill = pillRef.current;
    /* Follows the tab, not whatever is on the stage: the pill leaves the moment
       you click, while the outgoing view is still on its way out. */
    const target = tabRefs.current.get(value);

    if (!pill || !target) {
      return;
    }

    const slot = { x: target.offsetLeft, width: target.offsetWidth };

    /* Already there. Any re-run that is NOT a change of slot — a parent
       re-rendering, a fresh `items` array arriving with the same tabs in it —
       must not fire the travel again: on the selected tab that read as the
       pill bouncing in place under the pointer, which is not a thing the
       selection did. */
    const atX = Number(gsap.getProperty(pill, "x"));
    const atWidth = Number(gsap.getProperty(pill, "width"));
    if (pill.style.width !== "" && Math.abs(atX - slot.x) < 0.5 && Math.abs(atWidth - slot.width) < 0.5) {
      return;
    }

    /* First paint, or reduced motion: the pill is simply where it belongs.
       "First" is read off the element rather than a ref — StrictMode's
       throwaway mount reverts the inline styles the set wrote, and an armed ref
       would leave the real mount animating a pill that is back to zero width. */
    if (pill.style.width === "" || prefersReducedMotion()) {
      gsap.set(pill, { ...slot, scaleX: 1, scaleY: 1, skewX: 0 });
      return;
    }

    const goingRight = slot.x > Number(gsap.getProperty(pill, "x"));
    /* Only a real change of seat gets a voice: the bail-outs above cover the
       first paint and any re-run that lands on the same slot, so a hover or a
       parent re-render never makes a sound. */
    gooSfx.play("slide", { frame: theme, direction: goingRight ? "up" : "down" });

    /* The previous trip dies here. Without it, a click landing inside the 620ms
       flight leaves both timelines alive and both writing width to the same
       pill every frame — and width is layout, so a flurry of clicks piles up
       synchronous reflows underneath the stage swap. The new trip starts from
       wherever the pill actually is. */
    gsap.killTweensOf(pill);

    const timeline = gsap
      .timeline()
      .to(pill, { ...slot, duration: 0.26, ease: "power3.inOut" }, 0)
      /* The squash: long and flat mid-flight, leaning into the travel. */
      .to(
        pill,
        {
          scaleX: 1.25,
          scaleY: 0.78,
          skewX: goingRight ? -8 : 8,
          duration: 0.11,
          ease: "power2.out",
        },
        0,
      )
      /* The wobble: everything rings back to rest on one elastic. */
      .to(
        pill,
        { scaleX: 1, scaleY: 1, skewX: 0, duration: 0.5, ease: "elastic.out(1, 0.32)" },
        0.12,
      );

    return () => {
      timeline.kill();
    };
  }, [value, items]);

  /* The pill is parked at pixel coordinates measured once, so anything that
     re-lays the row out — a window resize, a font finally arriving — leaves it
     sitting under the wrong label. Re-park it, without animating: this is not
     a selection changing, it is the same selection being re-measured.
   *
   * Observed once, for the life of the row, and reading the current selection
   * off a ref: re-observing on every pick would deliver an initial callback
   * mid-flight and park the pill on the spot it was still travelling to. The
   * width guard is the same defence against that first delivery. */
  useLayoutEffect(() => {
    const row = rowRef.current;

    if (!row || typeof ResizeObserver === "undefined") {
      return;
    }

    let lastWidth = row.offsetWidth;

    const observer = new ResizeObserver(() => {
      const pill = pillRef.current;
      const target = tabRefs.current.get(valueRef.current);

      if (!pill || !target || row.offsetWidth === lastWidth) {
        return;
      }

      lastWidth = row.offsetWidth;
      gsap.killTweensOf(pill);
      gsap.set(pill, {
        x: target.offsetLeft,
        width: target.offsetWidth,
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
      });
    });

    observer.observe(row);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div className={styles.tabs} role="tablist" aria-label={label} ref={rowRef}>
      <span className={styles.pill} aria-hidden="true" ref={pillRef} />
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === value}
          className={[styles.tab, item.id === value ? styles.tabActive : ""]
            .filter(Boolean)
            .join(" ")}
          ref={(node) => {
            if (node) {
              tabRefs.current.set(item.id, node);
            } else {
              tabRefs.current.delete(item.id);
            }
          }}
          aria-label={typeof item.label === "string" ? undefined : item.name}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
