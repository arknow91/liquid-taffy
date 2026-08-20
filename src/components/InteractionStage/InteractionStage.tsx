/* InteractionStage — the first three liquid surfaces on ONE view, with the
 * banners' pill row switching between them.
 *
 * The three are IMPORTED, never re-implemented: this file owns the stage, the
 * switch and the labels, and nothing else. Change LiquidMenu, LiquidAdd or
 * LiquidMorph in their own folders and this view changes with them — there is
 * only ever one copy of each interaction in the repo.
 *
 * The labels drop the "liquid" and say what the interaction actually does, and
 * they run in order of how far the button goes: it stays put and hangs a
 * dropdown above itself, it becomes the dropdown, it breaks into three.
 *
 * The switch itself is instant — the surface on the stage is the thing being
 * looked at, and a stage that fades or slides puts its own motion in front of
 * the motion you came to see. The only thing that travels is the pill.
 *
 * The FRAME is not this view's business either: light and dark arrive through
 * the theme context (liquid/theme.ts), so nothing here has to be handed down
 * and nothing here can forget to hand it on. */

import { useState } from "react";

import { LiquidAdd } from "../LiquidAdd";
import { LiquidMenu } from "../LiquidMenu";
import { LiquidMorph } from "../LiquidMorph";
import { PillTabs, type PillTabItem } from "../PillTabs";
import styles from "./InteractionStage.module.css";

export type InteractionId = "anchored-dropdown" | "morphing-dropdown" | "speed-dial";

const TABS: readonly PillTabItem<InteractionId>[] = [
  { id: "anchored-dropdown", label: "Anchored dropdown" },
  { id: "morphing-dropdown", label: "Morphing dropdown" },
  { id: "speed-dial", label: "Speed dial" },
];

export function InteractionStage() {
  const [shown, setShown] = useState<InteractionId>("anchored-dropdown");

  return (
    <div className={styles.shell}>
      <div className={styles.stage}>
        {/* Keyed so a switch is a fresh surface arriving, not the old one being
            redressed in place — each of these owns a GSAP timeline and a goo
            filter tuned to its own geometry. */}
        {shown === "anchored-dropdown" ? <LiquidAdd key="anchored-dropdown" /> : null}
        {shown === "morphing-dropdown" ? <LiquidMorph key="morphing-dropdown" /> : null}
        {shown === "speed-dial" ? <LiquidMenu key="speed-dial" /> : null}
      </div>

      <div className={styles.bar}>
        <PillTabs items={TABS} value={shown} onChange={setShown} label="Interactions" />
      </div>
    </div>
  );
}
