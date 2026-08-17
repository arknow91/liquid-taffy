/* The family's shared spring curves, sampled by the motion kit's spring.mjs —
   the same polylines every liquid component hands to GSAP as a CustomEase.
   ONE copy: a component that needs its own uniquely-named ease instance calls
   springEase with its own name, but the curve itself can never drift. */

import { CustomEase } from "gsap/CustomEase";

/* House spring: ζ=0.434, ω=22.46 — 22% overshoot, ring, settle. */
export const HOUSE_SPRING_POINTS: readonly [number, number][] = [
  [0.028, 0.0289], [0.056, 0.1062], [0.083, 0.2182], [0.111, 0.3519],
  [0.139, 0.4957], [0.167, 0.6396], [0.194, 0.7755], [0.222, 0.8974],
  [0.25, 1.0013], [0.278, 1.0849], [0.306, 1.1474], [0.333, 1.1896],
  [0.361, 1.213], [0.389, 1.22], [0.417, 1.2134], [0.444, 1.1961],
  [0.472, 1.1714], [0.5, 1.1419], [0.528, 1.1102], [0.556, 1.0786],
  [0.583, 1.0487], [0.611, 1.022], [0.639, 0.9992], [0.667, 0.981],
  [0.694, 0.9673], [0.722, 0.9581], [0.75, 0.9531], [0.778, 0.9516],
  [0.806, 0.9531], [0.833, 0.957], [0.861, 0.9624], [0.889, 0.969],
  [0.917, 0.9759], [0.944, 0.9829], [0.972, 0.9894], [1, 1],
];

/* Pop spring: ζ=0.479, ω=18.09 — 18% overshoot, carries each drop's leap. */
export const POP_SPRING_POINTS: readonly [number, number][] = [
  [0.028, 0.0237], [0.056, 0.0875], [0.083, 0.1806], [0.111, 0.2931],
  [0.139, 0.416], [0.167, 0.5418], [0.194, 0.664], [0.222, 0.7777],
  [0.25, 0.8795], [0.278, 0.967], [0.306, 1.0389], [0.333, 1.0951],
  [0.361, 1.1359], [0.389, 1.1626], [0.417, 1.1767], [0.444, 1.1799],
  [0.472, 1.1742], [0.5, 1.1617], [0.528, 1.1442], [0.556, 1.1235],
  [0.583, 1.1012], [0.611, 1.0786], [0.639, 1.0569], [0.667, 1.0367],
  [0.694, 1.0188], [0.722, 1.0035], [0.75, 0.9911], [0.778, 0.9814],
  [0.806, 0.9745], [0.833, 0.9701], [0.861, 0.968], [0.889, 0.9677],
  [0.917, 0.9689], [0.944, 0.9714], [0.972, 0.9746], [1, 1],
];

export function springEase(name: string, points: readonly [number, number][]) {
  return CustomEase.create(name, `M0,0 L${points.map(([x, y]) => `${x},${y}`).join(" ")}`);
}
