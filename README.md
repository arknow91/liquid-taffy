# liquid-taffy

**Three liquid interactions you can grab, pull, and let snap back.**

One small plus-button, three ways for a menu to come out of it — and every surface on
screen behaves like taffy: press and drag any of them and a liquid finger stretches out
of the edge, follows your cursor against growing tension, and whips back into the rim
when you let go.

This is a reference implementation, not a package. It exists so you can read the source
and see exactly how a production-quality gooey interaction is put together: the SVG
filter, the border trick, the spring choreography, and the shared grab gesture.
A sibling of [liquid-gooey](https://github.com/Jakubantalik/Libraries/tree/main/packages/liquid-gooey),
built around a different question: not *"how do surfaces melt into each other"* but
*"how does one surface feel like it has a body"*.

## The three interactions

| Interaction | What the button does |
| --- | --- |
| **Anchored dropdown** | Stays put and pours a dropdown out of itself, hanging 14px above — the drop leaps upward on a pop spring, rows condense bottom-up. |
| **Morphing dropdown** | *Becomes* the dropdown. The circle stretches upward, its mass drawn into the pour; closing gathers the panel, necks it, and dives it back into the circle — splat included. |
| **Speed dial** | Breaks into three droplets that ooze out of the button, launch past full size, and ring themselves still. |

All three share one trigger, one visual language, and — literally — one gesture engine.

## Run it

```bash
npm install
npm run dev
```

Then click the plus. Also: **hold and drag** the plus, a satellite, or the open panel.
That's the part you can't screenshot.

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

## Project structure

```
src/components/
  InteractionStage/   the demo stage and the pill switcher
  LiquidAdd/          anchored dropdown
  LiquidMorph/        morphing dropdown
  LiquidMenu/         speed dial (+ shared icons)
  liquid/
    stretch.ts        THE grab gesture — one engine for the family
    springs.ts        sampled spring curves
    goo.ts            rim calibration: solved thresholds per blur
    squircle.ts       Apple's continuous corner, as a path
```

Each interaction owns its choreography (open/close timelines, geometry, blur levels);
everything that must never drift apart between them — the gesture, the curves, the rim
math — lives in `liquid/`.

## Accessibility

- `prefers-reduced-motion` collapses every animation to a static state change, including
  the press squash.
- The trigger is a real `<button>` with `aria-expanded` / `aria-haspopup` /
  `aria-controls`; menu items are `role="menuitem"` inside a `role="menu"`; closed menus
  are `inert`.
- `Escape` closes and returns focus to the trigger; a drag-release is distinguished from
  a click, so stretching something never accidentally activates it.

## Credits

Motion language after Apple's liquid glass. Built with [GSAP](https://gsap.com) +
React 19 + Vite. Filter tricks descend from the classic SVG gooey-effect lineage —
blur, threshold, and a lot of border calibration on top.

MIT — see [LICENSE](LICENSE).
