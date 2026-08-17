/* The goo filter's rim calibration — ONE solved table for the family.

   Every liquid component draws its border as the sliver between two iso-alpha
   contours of the SAME blurred alpha, so how far apart those contours land in
   PIXELS is set by the blur: one fixed pair of thresholds would draw a
   DIFFERENT border at every σ — a rim that visibly fattens or thins the
   moment anything moves. Each working blur therefore carries its own pair,
   solved by rasterizing the exact filter over a 32px disc and integrating the
   rim's ink, so that at EVERY σ the rim's outer edge lands on the CSS
   border's outer edge (r=16) and its weight equals 1px of #dadada.
   One border, whatever the liquid does. */

import gsap from "gsap";

/* Solved [outer, inner] threshold offsets per working σ.
   σ4 is the exception: it is the morph's opening blur, kept at the family's
   older fixed pair so the morph looks exactly as it always did — it is the
   one blur here that has not been through the solver. */
export const GOO_RIM_THRESHOLDS: Record<number, readonly [outer: number, inner: number]> = {
  1: [-14.5146, -24.6721],
  4: [-12.25, -14.25],
  5: [-12.7296, -15.063],
  7: [-11.6925, -13.245],
};

/* Alpha-only threshold: the RGB rows stay identity so the interior keeps the
   blurred source colors (two fills blend into a gradient at a neck). */
export function gooThreshold(offset: number) {
  return `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 30 ${offset}`;
}

export interface GooFilterEls {
  blur: SVGFEGaussianBlurElement | null;
  rim: SVGFEColorMatrixElement | null;
  inner: SVGFEColorMatrixElement | null;
}

/* The blur and its two thresholds are ONE setting — a blur changed without
   its matching thresholds is a different border. Always set them together,
   in the same frame: on a timeline when the switch belongs to a
   choreography, straight through gsap when it happens on a pointer event. */
export function setGooBlur(els: GooFilterEls, blur: number, tl?: gsap.core.Timeline, at = 0) {
  const [outer, inner] = GOO_RIM_THRESHOLDS[blur];
  const steps: [Element | null, gsap.TweenVars][] = [
    [els.blur, { attr: { stdDeviation: blur } }],
    [els.rim, { attr: { values: gooThreshold(outer) } }],
    [els.inner, { attr: { values: gooThreshold(inner) } }],
  ];
  steps.forEach(([target, vars]) => {
    if (tl) {
      tl.set(target, vars, at);
    } else {
      gsap.set(target, vars);
    }
  });
}
