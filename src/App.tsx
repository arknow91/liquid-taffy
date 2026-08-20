import { useState } from "react";

import { ThemeStage, type StageTheme } from "./components/ThemeStage";
import styles from "./App.module.css";

export default function App() {
  /* The stage owns which frame it is standing on; the app follows, because
     the viewport's own ground has to flip with the surfaces on it. */
  const [theme, setTheme] = useState<StageTheme>("light");

  return (
    <main className={styles.viewport} data-theme={theme}>
      <div className={styles.stage}>
        <ThemeStage theme={theme} onThemeChange={setTheme} />
      </div>
    </main>
  );
}
