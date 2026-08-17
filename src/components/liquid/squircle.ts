/* Apple's continuous corner (the iOS squircle) — PaintCode coefficients.
   The dropdown panels draw their bodies and goo blobs with this exact path so
   the crisp picture and the liquid picture share one silhouette. */

export function squirclePath(x: number, y: number, w: number, h: number, r: number) {
  const s = Math.min(r * 1.528665, w / 2, h / 2);
  const u = (k: number) => s * (k / 1.528665);
  const c = [1.528665, 1.08849, 0.86840, 0.63149, 0.37283, 0.16906, 0.07491].map(u);
  const [c0, c1, c2, c3, c4, c5, c6] = c;
  return [
    `M ${x + c0} ${y}`,
    `L ${x + w - c0} ${y}`,
    `C ${x + w - c1} ${y} ${x + w - c2} ${y} ${x + w - c3} ${y + c6}`,
    `C ${x + w - c4} ${y + c5} ${x + w - c5} ${y + c4} ${x + w - c6} ${y + c3}`,
    `C ${x + w} ${y + c2} ${x + w} ${y + c1} ${x + w} ${y + c0}`,
    `L ${x + w} ${y + h - c0}`,
    `C ${x + w} ${y + h - c1} ${x + w} ${y + h - c2} ${x + w - c6} ${y + h - c3}`,
    `C ${x + w - c5} ${y + h - c4} ${x + w - c4} ${y + h - c5} ${x + w - c3} ${y + h - c6}`,
    `C ${x + w - c2} ${y + h} ${x + w - c1} ${y + h} ${x + w - c0} ${y + h}`,
    `L ${x + c0} ${y + h}`,
    `C ${x + c1} ${y + h} ${x + c2} ${y + h} ${x + c3} ${y + h - c6}`,
    `C ${x + c4} ${y + h - c5} ${x + c5} ${y + h - c4} ${x + c6} ${y + h - c3}`,
    `C ${x} ${y + h - c2} ${x} ${y + h - c1} ${x} ${y + h - c0}`,
    `L ${x} ${y + c0}`,
    `C ${x} ${y + c1} ${x} ${y + c2} ${x + c6} ${y + c3}`,
    `C ${x + c5} ${y + c4} ${x + c4} ${y + c5} ${x + c3} ${y + c6}`,
    `C ${x + c2} ${y} ${x + c1} ${y} ${x + c0} ${y}`,
    "Z",
  ].join(" ");
}
