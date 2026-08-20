/* THE FRAME — one type, one value, for the whole project.

   Light and dark were four things before this file: a type alias re-declared
   in every component, a prop threaded down through two stages, a `themeRef`
   copied into each surface so long-lived callbacks could ask which frame they
   were speaking in, and a palette hand-copied into four stylesheets. They are
   one thing now. The value travels by CONTEXT — the frame is a property of
   the stage, not of any one drop standing on it — and the colours travel by
   custom property (see styles/tokens.css). A component reads both; it owns
   neither.

   Standing something on the other frame is one line, anywhere in the tree:

     <LiquidThemeProvider value="dark"><LiquidMenu /></LiquidThemeProvider>

   which is also how two frames could ever share one screen. The default is
   light, so a surface lifted out of this repo with no provider above it
   still renders. */

import { createContext, useContext, useRef } from "react";

export type LiquidTheme = "light" | "dark";

const LiquidThemeContext = createContext<LiquidTheme>("light");

export const LiquidThemeProvider = LiquidThemeContext.Provider;

/* The frame this subtree is standing on. */
export function useLiquidTheme(): LiquidTheme {
  return useContext(LiquidThemeContext);
}

/* The same frame, as a ref — for the engines. They are created ONCE and live
   in refs of their own, so anything handed to them directly is frozen at the
   first render and stale the moment the frame changes; the voice asking which
   room it is speaking in has to read through something that is reassigned
   every render. This is that something. */
export function useLiquidThemeRef() {
  const theme = useLiquidTheme();
  const ref = useRef(theme);
  ref.current = theme;
  return ref;
}
