# liquid-taffy

**Three liquid interactions you can grab, pull, and let snap back — on two frames.**

One small plus-button, three ways for a menu to come out of it — and every surface on
screen behaves like taffy: press and drag any of them and a liquid finger stretches out
of the edge, follows your cursor against growing tension, and whips back into the rim
when you let go.

You land on both frames at once: a switch at the top carries the whole stage between a
light room and a dark one. They are not two colour schemes over one design. On the light
frame the family is monochrome and the liquid speaks for itself; the dark frame is where
the pad's colour language lives — every drop carries its own hue, joints light in the
colours of the two bodies making them, and a completed merge catches under the glyph.

This is a reference implementation, not a package. It exists so you can read the source
and see exactly how a production-quality gooey interaction is put together: the SVG
filter, the border trick, the spring choreography, and the shared grab gesture.
Everything here is built around one question — not *"how do surfaces melt into each
other"* but *"how does one surface feel like it has a body"*.

## The three interactions

| Interaction | What the button does |
| --- | --- |
| **Anchored dropdown** | Stays put and pours a dropdown out of itself, hanging 14px above — the drop leaps upward on a pop spring, rows condense bottom-up. |
| **Morphing dropdown** | *Becomes* the dropdown. The circle stretches upward, its mass drawn into the pour; closing gathers the panel, necks it, and dives it back into the circle — splat included. |
| **Speed dial** | Breaks into three droplets that ooze out of the button, launch past full size, and ring themselves still. |

All three share one trigger, one visual language, and — literally — one gesture engine.

Both dropdowns are **multi-select**: a row keeps the menu open and takes a tick, its glyph
spinning away as the tick grows out of it. Neighbouring selections stop being separate
shapes — the radii between them collapse and they pour into one rounded run. Tick all
four and the pad's glyphs take a bow from behind the panel.

## The two frames

| | Light | Dark |
| --- | --- | --- |
| **Colour** | none — the surfaces are ink on grey | one hue per body: circle red, cross blue-violet, square pink, triangle green |
| **Joints** | the border stays the border | each body lights ITS OWN side of a contact, so a weld runs one hue into the other |
| **Merge** | shows in the liquid alone | the welded glyphs catch their hue with a bloom |
| **Voice** | a shallow dish of water — higher, brighter, drier | a deep vessel of syrup — lower, darker, wetter, longer |

The speed dial's satellites sit in the pad's own compass — square left, triangle up,
circle right, the cross in the middle as the trigger.

The frame itself is one thing kept in two halves that cannot disagree: every colour
either frame wears lives in `src/styles/tokens.css`, and the frame as a *value* lives in
`src/components/liquid/theme.ts`. No component stylesheet names a colour and no
component takes a `theme` prop — see [One palette, one word](#one-palette-one-word).

## Run it

```bash
npm install
npm run dev
```

Then click the plus. Also: **hold and drag** the plus, a satellite, or the open panel —
that's the part you can't screenshot. Then switch the frame at the top and do it again:
on the dark frame, drag one drop into another and watch the border between them light in
both their colours at once.

Every gesture also makes a sound (see below). To run it silent:

```js
import { gooSfx } from "./components/liquid/sfx";
gooSfx.mute();          // or gooSfx.volume(0.3)
```

## How it's made

### Three layers, one picture at a time

Each component draws its scene twice, stacked:

1. **Crisp bodies** — plain CSS circles and an SVG squircle with a real 1px border and a
   real shadow. This is the resting picture.
2. **The goo** — the same shapes cloned into one `<svg>`, run through a
   blur → alpha-threshold filter (the classic metaball trick), which draws its own rim
   and casts one shadow for the whole mass.
3. **Icons and hit areas** — transparent buttons riding the same tweens, so glyphs stay
   crisp *above* the liquid and accessibility lives in real DOM buttons.

Exactly one of the first two layers is visible at any moment. At rest you are looking at
real CSS borders; the instant anything moves, the goo takes over the whole picture; when
the motion settles, it hands back. No half-blended states — even a sub-pixel of overlap
reads as a doubled border.

### The border that never swells

The goo's outline is not a stroke. It is the sliver between **two iso-alpha contours of
the same blurred alpha** — an outer threshold that lands on the border's outer edge and
an inner one a hair inside it. How far apart those contours land *in pixels* depends on
the blur σ, so a threshold pair that draws a 1px rim at σ=1 draws a fat, misplaced one
at σ=7. That is why gooey buttons in the wild appear to inflate the moment they start
moving.

Here every working blur carries its own threshold pair, solved offline by rasterizing
the exact filter over a 32px disc and integrating the rim's ink until its outer edge sat
on the CSS border's outer edge and its weight equalled 1px. Blur and thresholds are
switched together, in the same frame, always (`src/components/liquid/goo.ts`). The
result: one border, whatever the liquid does.

### The stretch is one engine

The grab gesture — press, drag, snap back — is a single implementation shared verbatim
by all three interactions (`src/components/liquid/stretch.ts`):

- A chain of four beads is drawn out of the rim, shaped like a real liquid finger:
  thick root, thin neck, a modest bulb at the head. Each bead follows a different
  fraction of the pull with a different lag, which is what keeps the goo bridge
  unbroken and gives the stretch its taper.
- The pull is clamped — past 44px the sponge stops giving — and the grabbed body leans
  after your cursor, stretching slightly along the pull direction.
- Release whips the chain home head-first on a spring, and the grabbed body shakes
  itself out with a squash-and-stretch splat.

One subtlety worth stealing: while a dropdown is closed, its panel hides *inside* the
button, scaled to ~0.1. During a grab that hidden mass must sit the gesture out — it
can't ride the button's lean, so left in the goo it pokes out of the moving silhouette
as a hump. The engine's host contract has a hook for exactly this.

### Springs, not durations

Nothing here eases with a stock curve. Two physical springs are sampled into GSAP
`CustomEase` polylines (`src/components/liquid/springs.ts`):

- **House spring** (ζ=0.434, ω=22.46 — 22% overshoot): everything that pops in or
  springs back.
- **Pop spring** (ζ=0.479, ω=18.09 — 18% overshoot): the louder curve that carries each
  drop's whole leap out of the button.

Entrances overshoot and ring; exits are authored, not reversed — big surfaces wind up
~10% the wrong way (anticipate) before collapsing, and whatever lands on the button is
absorbed with an impact squash. Colors never spring.

### The joint light

Drag one drop toward another and, a few pixels before they touch, the border between them
starts telling you about it (`src/components/liquid/seam.ts`). Nothing is painted on top
of the picture: the rim keeps being the rim, it just runs colour through the joint and
back out again a little way along each drop.

The engine reports **where** two rims meet, **how strongly**, and **whether they have
genuinely crossed** rather than merely leaned. Three things in it are worth stealing:

- **One lobe per BODY, not per pair.** A drop welded to one neighbour while its own rim
  still leans on a third used to be painted by both joints — two washes on one border
  sum, and the rim shimmered and dragged the neighbour's hue across it. Per body: every
  drop shows its own hue on its own side, exactly once, and the hues meet in the seam.
- **The weld is a latch, not a test.** It takes hold when the rims have genuinely crossed
  and only lets go once they have visibly come apart — the gap has to travel five pixels
  to change the answer. A single threshold sits exactly where the finger's beads breathe,
  so rolling from one neighbour to the next flipped it several times per gesture and
  every glyph wired to it blinked.
- **A lobe is parked most of the lit radius off the joint**, not half of it. A joint
  lights weakest — and so at its smallest radius — exactly when it first forms, and at
  half the lobes overlapped, so each border opened wearing a mix of both colours.

The light belongs to the dark frame. On the light frame the engine still runs — its
report is not only paint; it is what the glyphs and the voice answer to — it simply has
nothing to draw.

### The voice

Every sound is synthesized on the spot (`src/components/liquid/sfx.ts`), no samples, so a
repeated gesture never sounds like one file played twice. It is one little machine shaped
ten ways:

- a **body** — an oscillator sliding between two pitches; the slide *is* the viscosity
- a **throat** — a resonant lowpass sweeping with it: the hollow "bloop" of a bubble
- a **wobble** — a slow LFO bent into the pitch, the ear's version of the springs
- a **smack** — a whisper of filtered noise at the attack, the contact itself
- an **envelope** — attack and decay, and these are the character controls: everything
  else is a shape, the envelope is how hard and how long you press it

A frame is described as **multipliers** on that shape, never a second set of numbers, so
the two rooms cannot drift apart. Each of the dial's drops speaks in its own pitch, so a
contact tells you *which* contact it is without looking.

### One palette, one word

Light and dark used to be four things: a `"light" | "dark"` alias re-declared in every
component, a prop threaded down through two stages, a ref copied into each surface so
long-lived callbacks could ask which frame they were speaking in, and a palette
hand-copied into four stylesheets. Copies drift — two of those stylesheets had already
landed a percent apart on the same hover tint.

They are one thing now:

- **The colours** are `styles/tokens.css`, and only there: light under `:root`, dark
  under `[data-theme="dark"]`, which the app writes on the viewport (each liquid surface
  repeats it on its own root, so a component still knows its frame when it is lifted
  out). A component stylesheet reads; it never declares.
- **The value** is `liquid/theme.ts`: one `LiquidTheme` type and one context. `App`
  provides it once, and anything that needs the frame in TypeScript — the motif hues,
  the voice's two rooms, the burst — asks `useLiquidTheme()`. Nothing is threaded
  through props, so nothing can forget to pass it on. Standing a surface on the other
  frame is one line, anywhere in the tree:

  ```tsx
  <LiquidThemeProvider value="dark"><LiquidMenu /></LiquidThemeProvider>
  ```

What stays in TypeScript rather than CSS is what more than CSS reads. `liquid/hues.ts`
holds the motif — one hue per glyph per frame — because the joint's gradient, a glyph's
glow and the burst all need those values in JS, and with them the rule that makes the
light frame monochrome: there `motifHue` returns `null`, and every consumer falls back
to its own ink. One function, so the two frames can never drift.

The same tidying reached the two dropdowns' stylesheets. Once neither of them named a
colour, they were the same file twice over — so the surface they share (bodies, goo,
seam, rows, wash, glyph, trigger) is now `liquid/dropdown.module.css`, and each variant
composes it and adds the one thing that makes it itself: where its panel sits, 14px above
the button or exactly on it.

## Project structure

```
src/styles/
  tokens.css          THE palette — both frames; nothing else declares a colour
src/components/
  ThemeStage/         the two-frame stage: the switch, and the frame swap
  InteractionStage/   the three surfaces and the pill switcher
  LiquidAdd/          anchored dropdown
  LiquidMorph/        morphing dropdown
  LiquidMenu/         speed dial (+ shared icons)
  PillTabs/           the travelling pill, used by both switch rows
  liquid/
    theme.ts          THE frame, as a value: one type, one context
    stretch.ts        THE grab gesture — one engine for the family
    seam.ts           the joint light: where two rims meet, and how much
    springs.ts        sampled spring curves
    goo.ts            rim calibration: solved thresholds per blur
    squircle.ts       Apple's continuous corner, as a path
    hues.ts           the family's colour table — one per body, per frame
    select.ts         multi-select geometry: how neighbours become one shape
    sfx.ts            the voice — a tiny procedural synth, two characters
    motion.ts         prefers-reduced-motion, asked in one place
    IconMorph.tsx     a glyph spinning away as its tick grows out of it
    RowHover.tsx      one highlight travelling under a list
    SelectionBurst.tsx  the full set, taking its bow
    dropdown.module.css  the two dropdowns' shared surface
```

Each interaction owns its choreography (open/close timelines, geometry, blur levels);
everything that must never drift apart between them — the gesture, the curves, the rim
math, the frame, the palette — lives in `liquid/` or in `styles/tokens.css`.

## Accessibility

- `prefers-reduced-motion` collapses every animation to a static state change, including
  the press squash.
- The trigger is a real `<button>` with `aria-expanded` / `aria-haspopup` /
  `aria-controls`; the dial's items are `role="menuitem"` and the dropdowns'
  multi-select rows are `role="menuitemcheckbox"` with `aria-checked`, inside a
  `role="menu"`; closed menus are `inert`.
- Colour is never the only carrier: on the dark frame a selected row is a tick *and* a
  wash, a merge is a glyph change *and* a light, and the light frame carries the whole
  thing with no colour at all.
- `Escape` closes and returns focus to the trigger; a drag-release is distinguished from
  a click, so stretching something never accidentally activates it.

## A note on the marks

The four glyphs and the badge on the dark option refer to the PlayStation controller
because that is the visual joke the dark frame is built on. PlayStation is a trademark of
Sony Interactive Entertainment Inc. This project is an independent demo, is not
affiliated with or endorsed by Sony, and is not sold.

## Credits

Motion language after Apple's liquid glass. Built with [GSAP](https://gsap.com) +
React 19 + Vite. Filter tricks descend from the classic SVG gooey-effect lineage —
blur, threshold, and a lot of border calibration on top.

MIT — see [LICENSE](LICENSE).
