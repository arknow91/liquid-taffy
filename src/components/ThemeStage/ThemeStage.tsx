/* Light and dark on ONE stage.

   The whole liquid family, both frames, one screen: the family's own pill
   row switches the frame at the top, the three interactions run below it,
   and the swap between frames is a plain fade — the stage dips out, the
   frame changes while nothing is on screen to see it, and the stage comes
   back. The ground carries itself: the viewport's background transitions on
   its own clock, so the two cross over together.

   The switch stays visible throughout, so the frame change is something you
   WATCH happen on the control you pressed: its surface, rim and ink cross
   over in place while the stage behind it dips. It is the family's plain
   pill row, behaving exactly as the interaction row below does — the same
   travelling pill, the same hover ink — with one thing added: the dark
   option carries the PlayStation mark, because that frame is where the
   pad's colour language lives. */

import { useCallback, useEffect, useMemo, useRef } from "react";
import gsap from "gsap";

import { InteractionStage } from "../InteractionStage";
import { PillTabs, type PillTabItem } from "../PillTabs";
import { prefersReducedMotion } from "../liquid/stretch";
import { PlayStationMark } from "./PlayStationMark";
import styles from "./ThemeStage.module.css";

export type StageTheme = "light" | "dark";

export interface ThemeStageProps {
  theme: StageTheme;
  /* The frame lives in the app, so the viewport and the navigation ink flip
     with the stage — this view only decides WHEN. */
  onThemeChange: (theme: StageTheme) => void;
}

export function ThemeStage({ theme, onThemeChange }: ThemeStageProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const fadeTlRef = useRef<gsap.core.Timeline | null>(null);
  /* The fade commits the frame from inside a timeline, so the callback must
     never be a stale render's. */
  const commitRef = useRef(onThemeChange);
  commitRef.current = onThemeChange;

  useEffect(
    () => () => {
      fadeTlRef.current?.kill();
    },
    [],
  );

  const swapTheme = useCallback(
    (next: StageTheme) => {
      if (next === theme) {
        return;
      }

      const content = contentRef.current;
      if (!content || prefersReducedMotion()) {
        commitRef.current(next);
        return;
      }

      /* Out, swap, back in. The frame changes at the bottom of the dip, with
         nothing on screen to catch it changing; the ground crosses over on
         its own CSS clock underneath (see App's viewport), so the stage
         never lands on the wrong colour. Opacity only — a transform here
         would re-anchor the stage's viewport-pinned interaction row (see the
         stylesheet). */
      fadeTlRef.current?.kill();
      const tl = gsap.timeline();
      fadeTlRef.current = tl;
      tl.to(content, { autoAlpha: 0, duration: 0.22, ease: "power2.in" }, 0);
      tl.call(() => commitRef.current(next), undefined, 0.22);
      tl.to(content, { autoAlpha: 1, duration: 0.34, ease: "power2.out" }, 0.24);
    },
    [theme],
  );

  /* Memoised: a fresh array on every render would hand the row a "new" set
     of tabs and set its pill travelling again over the same slot. */
  const TABS: readonly PillTabItem<StageTheme>[] = useMemo(
    () => [
      { id: "light", label: "Light" },
      {
        id: "dark",
        name: "Dark",
        label: (
          <span className={styles.darkLabel}>
            Dark
            <PlayStationMark className={styles.mark} />
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className={styles.shell}>
      <div className={styles.switchRow}>
        <PillTabs items={TABS} value={theme} onChange={swapTheme} label="Frame" theme={theme} />
      </div>

      <div ref={contentRef} className={styles.content}>
        <InteractionStage theme={theme} />
      </div>
    </div>
  );
}
