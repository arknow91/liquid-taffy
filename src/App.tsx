import { InteractionStage } from "./components/InteractionStage";
import styles from "./App.module.css";

export default function App() {
  return (
    <main className={styles.viewport}>
      <div className={styles.stage}>
        <InteractionStage />
      </div>
    </main>
  );
}
