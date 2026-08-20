import { useState } from "react";

import { LiquidThemeProvider, type LiquidTheme } from "./components/liquid/theme";
import { ThemeStage } from "./components/ThemeStage";
import styles from "./App.module.css";

export default function App() {
  /* The stage owns which frame it is standing on; the app follows, because
     the viewport's own ground has to flip with the surfaces on it. */
  const [theme, setTheme] = useState<LiquidTheme>("light");

  /* The two ways the frame travels: as a data attribute, which hands the
     whole subtree its palette (styles/tokens.css), and as context, which
     hands it the same two words in TypeScript (components/liquid/theme.ts) —
     the motif hues, the voice and the burst all ask for it. Nothing below has
     to pass it on, and so nothing below can forget to. */
  return (
    <LiquidThemeProvider value={theme}>
      <main className={styles.viewport} data-theme={theme}>
        <div className={styles.stage}>
          <ThemeStage theme={theme} onThemeChange={setTheme} />
        </div>
      </main>
    </LiquidThemeProvider>
  );
}
