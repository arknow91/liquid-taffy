/* The seam — where a pulled rim and a standing rim find each other.

   Drag a liquid body toward its neighbour and, a few pixels before they meet,
   the goo starts bending the two borders together. This engine says WHERE that
   is happening and HOW MUCH, and hands both numbers to a gradient the rim is
   painted with. Nothing is drawn on top of the picture: the border keeps being
   the border, it just runs blue through the joint and back into its own colour
   a little way along each drop.

   Only the seams' positions, radii and strengths live here. The paint — which
   blue, how it blends back into the rim, how it is masked to the rim sliver —
   is the host's, in its own stylesheet and defs, because that is where the rim
   the light has to match already lives.

   ONE LIGHT PER JOINT. A single light shared between joints has to travel from
   one to the other when the strongest changes, and a slide of thirty pixels
   under a finger that moved three is exactly what reads as a jump — whether
   the switch is instant or blended over a few frames. So each joint gets its
   own layer: it lights where its joint is, moves only as that joint moves, and
   hands over by fading, in place, while the next one comes up in ITS place.
   Nothing ever travels between two joints. */

import gsap from "gsap";

/* The rims start pulling at each other a touch before they touch — a little
   wider than the goo's own neck reach at the grab blur, so the light is
   already breathing in when the borders visibly start leaning and never has
   to blink into existence at the moment of contact. */
const REACH = 14;
/* Past the meeting point there is no distance left to measure — what decides
   the light is the NECK. Two rims that have just crossed share a hairline
   chord and read as two drops touching; push further and the chord widens
   until it is as broad as the smaller drop, at which point the outline has no
   neck in it at all, just a bulge. The light lives exactly as long as that
   neck is visible, which is why nothing here is a cutoff: a depth threshold is
   what made it blink out mid-drag. */
/* A blob's rim fades into the reckoning across this band instead of switching
   on at a threshold — the grab's beads breathe through it as the finger
   extends, and a hard edge popped a whole new joint into existence. */
const RIM_MIN = 3;
const RIM_FADE = 4;

/* How wide the neck may get — as a share of the smaller drop — before the
   light starts going out. High on purpose: with a grab chain the crossing
   bead is often swallowed while the VISIBLE waist between the two bodies is
   still pronounced, and a lower hold kept turning the light off exactly when
   the joint was at its most joined. */
const NECK_HOLD = 0.85;

/* The held joint's breath: shallow and slow. */
const BREATH_DEPTH = 0.03;
const BREATH_RATE = 3.4;

/* How dim a layer has to be before it is allowed to move to another joint.
   A touch of visible tail is acceptable — at 4% a re-point does not read as a
   jump — because the alternative is worse: a joint standing dark while it
   waits for a layer to finish dying is a light arriving LATE. */
const SEAM_FREE = 0.04;

/* How long the light takes to come up and to go out, in seconds. The rise is
   brisk — the joint must light the moment the rims lean, or the liquid reads
   as noticing the touch late. The fall stays slower so a rim wobbling by a
   pixel breathes instead of flickering, and so a freed layer is available
   again quickly for the next joint. */
const SEAM_RISE = 0.055;
const SEAM_FALL = 0.14;

/* How long the light takes to catch up with the joint, in seconds. Long enough
   that a hand-over between two neighbours is a glide, short enough that the
   light never looks towed behind a quick drag. */
const SEAM_CHASE = 0.06;

/* The lit stretch of border, at full strength: the joint plus an arc either
   side of it — a piece of each drop's border, not a whole circle of blue. */
const SEAM_MIN = 13;
const SEAM_MAX = 24;

/* How far off the joint a body's lobe is parked, as a share of the lit
   radius. Most of it, not half: a joint lights weakest — and so at its
   SMALLEST radius — exactly when it first forms, and at half the lobes sat
   barely a few pixels apart, so each body's border opened wearing a mix of
   both hues and only resolved as the light grew. This far out, a border is
   its own colour from the first lit frame and the blend stays in the seam. */
const LOBE_OFFSET = 0.85;

/* A weld is a LATCH, not a test. Two thresholds, not one: it takes hold
   when the rims have genuinely crossed (WELD_ON) and only lets go once they
   have visibly come apart again (WELD_OFF) — the gap has to travel five
   pixels to change the answer. A single threshold sits exactly where the
   finger's beads breathe: their radii pulse with tension, their positions
   lag on tweens, and rolling a finger from one neighbour toward the next
   walks the gap back and forth across that one line — so the flag flipped
   several times per gesture and every glyph wired to it BLINKED, the X
   worst of all, because it is in every joint.

   The clock hold below is the second line of defence, for chatter fast
   enough to cross both thresholds. */
const WELD_ON = -3;
const WELD_OFF = 2;

/* How long a weld stays TRUE after the latch last read true, in seconds. */
const WELD_HOLD = 0.18;

/* A blob and the body it belongs to. The finger a grab draws out is not a
   thing in its own right — it is the grabbed button's own border, stretched —
   so its beads carry that button's owner and can never light a seam against
   it. Only borders of two DIFFERENT bodies make a joint.

   A part is a circle unless it carries `rect`: the dropdowns' panels are
   rounded-rect paths, and a finger pulled into one makes a joint against a
   locally-flat wall instead of another disc. The geometry given here is the
   UNTRANSFORMED one baked into the path's own coordinates — the engine reads
   the element's live matrix, same as it does for a circle's. */
export interface SeamPart {
  blob: SVGGraphicsElement | null;
  owner: string;
  rect?: { x: number; y: number; width: number; height: number; radius: number };
}

export interface LiquidSeamHost {
  /* Gated on the host's grab flag: this is a gesture's feedback, not a state
     the component wears at rest. */
  anchor(): HTMLElement | null;
  /* Every circle the goo is drawing, tagged with whose border it is. */
  parts(): SeamPart[];
  /* One layer per joint that can be lit at once — two is enough for a
     hand-over: the joint being left and the one being reached. */
  layers(): SeamLayer[];
  /* Which BODY a layer has just taken, and where its lobe sits (goo canvas
     coordinates). The host paints it in that body's own colour — or, where a
     surface has no per-body hue, by WHERE the border was touched (a dropdown
     row). Called only on a change, and always while the layer is dark. */
  paint?(index: number, owner: string, at: { x: number; y: number }): void;
  /* Called every tick a layer is holding a LIT joint, with the light's
     current position. The dial never needs it — its pairs each own one hue —
     but a joint that can roll along a panel's edge changes which row it is
     nearest to without ever changing pair, and this is where the host gets to
     follow. Repainting while lit is the host's own risk: a colour snap is
     visible, so only repaint when the answer genuinely changed. */
  repaint?(index: number, owner: string, at: { x: number; y: number }): void;
  /* Every live joint, every tick: who touches whom, how strongly, and
     whether the rims have genuinely CROSSED (joined) rather than merely
     leaning. For feedback past the border itself — an icon that catches the
     joint's colour once the drops are one. Empty while nothing touches, so a
     host can simply clear. */
  joints?(joints: SeamJoint[]): void;
}

export interface SeamJoint {
  owners: [string, string];
  strength: number;
  /* True once the two rims have sunk well past the first touch — the
     "joined for good" of a merge, not the graze of a contact. */
  joined: boolean;
  /* Where the joint is, in goo-canvas coordinates. Absent on a pair that is
     joined but no longer makes a neck (a drop fully swallowed): there is no
     contact point left to name, and the host keeps whatever it lit last. */
  x?: number;
  y?: number;
}

/* The paint one BODY wears through a joint: a gradient parked on that body's
   own side of it, and the element carrying that gradient.

   One lobe per body, not per pair. A body in two live joints at once — the
   drop a finger is welded into while its own rim still leans on a third —
   used to be painted by both, and two washes on one border sum: the rim
   shimmered and dragged the neighbour's hue across it. And a pair-shaped
   lobe could only ever say something about two bodies, so in a three-body
   cluster the odd one out either went unpainted or wore a neighbour's
   colour. Per body: every drop in the picture shows ITS OWN hue on ITS OWN
   side, exactly once, and the hues meet in the seam between them. */
export interface SeamLayer {
  gradient: SVGRadialGradientElement | null;
  paint: SVGElement | null;
}

export interface LiquidSeam {
  start(): void;
  kill(): void;
}

interface Disc {
  kind: "disc";
  x: number;
  y: number;
  r: number;
  owner: string;
}

/* A rounded rect, live in canvas coordinates: center, half-sizes, corner
   radius. Axis-aligned on purpose — the panels only ever TRANSLATE while a
   grab is live (their resting tilt exists only while they are hidden), so the
   engine does not pay for rotation it can never see. */
interface Round {
  kind: "rect";
  x: number;
  y: number;
  hw: number;
  hh: number;
  radius: number;
  owner: string;
}

type Shape = Disc | Round;

function hiddenByStyle(blob: SVGGraphicsElement) {
  if (blob.style.visibility === "hidden") {
    return true;
  }
  const alpha = blob.style.opacity;
  return alpha !== "" && Number(alpha) < 0.05;
}

/* Where a blob's center and radius actually are this frame — read off the
   element's own matrix, so it works no matter who is animating it. */
function readDisc(blob: SVGCircleElement, owner: string): Disc | null {
  if (hiddenByStyle(blob)) {
    return null;
  }

  const matrix = blob.getCTM();
  if (!matrix) {
    return null;
  }

  const cx = blob.cx.baseVal.value;
  const cy = blob.cy.baseVal.value;
  const scaleX = Math.hypot(matrix.a, matrix.b);
  const scaleY = Math.hypot(matrix.c, matrix.d);
  const r = (blob.r.baseVal.value * (scaleX + scaleY)) / 2;

  /* A blob scaled away — a parked satellite, an unused chain bead — has no rim
     to lend to a seam. Weighed in, not cut off: see RIM_FADE. */
  if (r < RIM_MIN) {
    return null;
  }

  return {
    kind: "disc",
    x: matrix.a * cx + matrix.c * cy + matrix.e,
    y: matrix.b * cx + matrix.d * cy + matrix.f,
    r,
    owner,
  };
}

function readRound(
  blob: SVGGraphicsElement,
  rect: NonNullable<SeamPart["rect"]>,
  owner: string,
): Round | null {
  if (hiddenByStyle(blob)) {
    return null;
  }

  const matrix = blob.getCTM();
  if (!matrix) {
    return null;
  }

  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const scaleX = Math.hypot(matrix.a, matrix.b);
  const scaleY = Math.hypot(matrix.c, matrix.d);
  const hw = (rect.width / 2) * scaleX;
  const hh = (rect.height / 2) * scaleY;

  /* A panel parked inside its trigger (rest scale) is a body with no rim to
     lend — same rule as a scaled-away disc. */
  if (Math.min(hw, hh) < RIM_MIN) {
    return null;
  }

  return {
    kind: "rect",
    x: matrix.a * cx + matrix.c * cy + matrix.e,
    y: matrix.b * cx + matrix.d * cy + matrix.f,
    hw,
    hh,
    radius: rect.radius * ((scaleX + scaleY) / 2),
    owner,
  };
}

function readShape(part: SeamPart): Shape | null {
  if (!part.blob) {
    return null;
  }
  return part.rect
    ? readRound(part.blob, part.rect, part.owner)
    : readDisc(part.blob as SVGCircleElement, part.owner);
}

/* One touch between two shapes, in the terms the light thinks in: the gap
   between the rims (negative once crossed), the neck's half-chord over the
   smaller radius, where the joint is, each side's effective rim radius (for
   the barely-there fade) — and the joint's AXIS, the unit direction from the
   first shape to the second, which is what lets a two-hue host put each
   body's colour on that body's side of the light. */
interface Contact {
  gap: number;
  neck: number;
  x: number;
  y: number;
  rimA: number;
  rimB: number;
  ax: number;
  ay: number;
}

function discDisc(a: Disc, b: Disc): Contact {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 0.0001;
  const gap = d - (a.r + b.r);

  /* The chord the two circles share — zero the moment they touch, widening as
     one sinks into the other. Past the touch it is the chord, not the
     distance, that says whether there is still a neck to light: when it is as
     broad as the smaller drop the outline has no neck in it, just a bulge. */
  const foot = gap > 0 ? a.r + gap / 2 : (d * d + a.r * a.r - b.r * b.r) / (2 * d);
  const chord = gap > 0 ? 0 : Math.sqrt(Math.max(0, a.r * a.r - foot * foot));

  return {
    gap,
    neck: chord / Math.min(a.r, b.r),
    x: a.x + (dx / d) * foot,
    y: a.y + (dy / d) * foot,
    rimA: a.r,
    rimB: b.r,
    ax: dx / d,
    ay: dy / d,
  };
}

/* A disc against a rounded rect's wall. The signed distance from the disc's
   center to the rect's boundary plays the role the center-to-center distance
   plays between two discs: gap = sd - r, and once crossed the chord the disc
   cuts through the locally-flat wall is √(r² − sd²) — the same neck language,
   measured against a straight rim instead of a curved one. */
function discRect(d: Disc, rc: Round): Contact {
  const px = d.x - rc.x;
  const py = d.y - rc.y;
  const bx = Math.max(0, rc.hw - rc.radius);
  const by = Math.max(0, rc.hh - rc.radius);
  const qx = Math.abs(px) - bx;
  const qy = Math.abs(py) - by;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  const outer = Math.hypot(ox, oy);
  const sd = outer + Math.min(Math.max(qx, qy), 0) - rc.radius;

  /* Outward unit normal at the nearest boundary point. */
  let nx: number;
  let ny: number;
  if (outer > 0) {
    nx = ox / outer;
    ny = oy / outer;
  } else if (qx > qy) {
    nx = 1;
    ny = 0;
  } else {
    nx = 0;
    ny = 1;
  }
  nx *= px < 0 ? -1 : 1;
  ny *= py < 0 ? -1 : 1;

  const gap = sd - d.r;
  const halfChord = Math.abs(sd) < d.r ? Math.sqrt(Math.max(0, d.r * d.r - sd * sd)) : 0;

  /* Outside, the joint sits midway across the gap between the two rims;
     crossed, it sits on the wall itself — the disc's projection onto it. */
  const at = gap > 0 ? d.r + gap / 2 : sd;

  return {
    gap,
    neck: halfChord / d.r,
    x: d.x - nx * at,
    y: d.y - ny * at,
    rimA: d.r,
    rimB: Math.min(rc.hw, rc.hh),
    /* From the disc toward the wall — the outward normal, negated. */
    ax: -nx,
    ay: -ny,
  };
}

function flipAxis(contact: Contact): Contact {
  return { ...contact, ax: -contact.ax, ay: -contact.ay };
}

function measure(a: Shape, b: Shape): Contact | null {
  if (a.kind === "disc" && b.kind === "disc") {
    return discDisc(a, b);
  }
  if (a.kind === "disc" && b.kind === "rect") {
    return discRect(a, b);
  }
  if (a.kind === "rect" && b.kind === "disc") {
    return flipAxis(discRect(b, a));
  }
  /* Two panels never touch in this family. */
  return null;
}

export function createLiquidSeam(host: LiquidSeamHost): LiquidSeam {
  let running = false;

  /* Which pairs the latch currently holds welded, and when each last read
     true — the two halves of the hysteresis. */
  const welded = new Set<string>();
  const weldedAt = new Map<string, number>();

  /* What each layer is currently lighting: the pair it is bound to, how bright
     it is, and where. `at` is null while the layer is dark, so the next joint
     it takes lights up in place instead of flying in from the last one. */
  interface LayerState {
    key: string | null;
    shown: number;
    at: { x: number; y: number; r: number } | null;
  }

  const states: LayerState[] = [];

  interface Candidate {
    key: string;
    x: number;
    y: number;
    r: number;
    ax: number;
    ay: number;
    strength: number;
    joined: boolean;
  }

  interface Group {
    key: string;
    weight: number;
    x: number;
    y: number;
    r: number;
    ax: number;
    ay: number;
    strength: number;
    joined: boolean;
  }

  function collect(): { candidates: Candidate[]; joined: Set<string> } {
    /* Pairs whose rims have sunk well past the first touch. Tracked OUTSIDE
       the light: a fully swallowed drop makes no neck to light, so its pair
       drops out of the candidates — but "joined" is exactly then at its
       truest, and the host's glow must not blink out at the deepest point. */
    const joined = new Set<string>();

    /* Every pair close enough to be judged this tick. A pair that drifts out
       of REACH is never looked at again, so the latch has to be cleared
       here or it would hold a weld that no longer exists. */
    const measured = new Set<string>();

    const anchor = host.anchor();
    if (!anchor || !anchor.hasAttribute("data-grab")) {
      welded.clear();
      return { candidates: [], joined };
    }

    const shapes = host
      .parts()
      .map(readShape)
      .filter((shape): shape is Shape => shape !== null);

    /* Keyed by the two BODIES, not the two circles. A finger is four beads
       plus the drop it was pulled from, so one contact against a neighbour
       shows up as several blob pairs at once — and as the contact rolls along
       the finger, which of them is strongest changes every few frames. Treated
       as separate joints they made the light hop between beads a few pixels
       apart, and worse, a layer locked onto one bead kept lighting it after
       the real contact had rolled past. They are ONE joint: the same two
       borders touching. Their points sit within a few pixels of each other, so
       averaging inside the group is smooth, and the group's key only changes
       when the finger genuinely reaches a different button. */
    const groups = new Map<string, Group>();

    for (let i = 0; i < shapes.length; i += 1) {
      for (let j = i + 1; j < shapes.length; j += 1) {
        const a = shapes[i];
        const b = shapes[j];
        if (a.owner === b.owner) {
          continue;
        }

        const contact = measure(a, b);
        if (!contact || contact.gap > REACH) {
          continue;
        }
        const { gap, neck } = contact;

        /* Crossed rims keep the light at FULL through the whole stretch that
           still reads as two drops joined — the neck has to be more than half
           the smaller drop wide before anything dims. Fading from the first
           frame of contact (which is what a plain 1 - chord/r does) took the
           blue down to half exactly where the joint is most worth showing. */
        /* The approach eases OUT of the dark — most of the light arrives in
           the first half of the closing distance, so a rim hovering a few
           pixels off its neighbour already glows instead of barely smoulders. */
        const strength =
          gap > 0
            ? Math.pow(1 - gap / REACH, 0.6)
            : Math.min(1, Math.max(0, (1 - neck) / (1 - NECK_HOLD)));

        /* Two rims barely there make a faint joint, not a full one. */
        const rimWeight = Math.max(
          0,
          Math.min(1, Math.min(contact.rimA - RIM_MIN, contact.rimB - RIM_MIN) / RIM_FADE),
        );
        const lit = strength * rimWeight;

        const pairKey = a.owner < b.owner ? `${a.owner}|${b.owner}` : `${b.owner}|${a.owner}`;
        measured.add(pairKey);
        /* The axis always runs from the sorted pair's FIRST owner to its
           second, so a host can colour "this side" without guessing. */
        const sortedAx = a.owner < b.owner ? contact.ax : -contact.ax;
        const sortedAy = a.owner < b.owner ? contact.ay : -contact.ay;
        /* A merge, not a graze — and independent of the light, which dims
           exactly when the merge is deepest. The latch takes hold deep and
           lets go only once the rims are apart again. */
        if (rimWeight <= 0 || gap > WELD_OFF) {
          welded.delete(pairKey);
        } else if (gap <= WELD_ON) {
          welded.add(pairKey);
        }
        if (welded.has(pairKey)) {
          joined.add(pairKey);
        }

        if (lit <= 0.004) {
          continue;
        }

        const key = pairKey;
        const weight = lit * lit * lit;
        const group =
          groups.get(key) ??
          { key, weight: 0, x: 0, y: 0, r: 0, ax: 0, ay: 0, strength: 0, joined: false };
        group.weight += weight;
        group.x += contact.x * weight;
        group.y += contact.y * weight;
        group.ax += sortedAx * weight;
        group.ay += sortedAy * weight;
        group.r += (SEAM_MIN + (SEAM_MAX - SEAM_MIN) * lit) * weight;
        group.strength = Math.max(group.strength, lit);
        groups.set(key, group);
      }
    }

    [...welded].forEach((key) => {
      if (!measured.has(key)) {
        welded.delete(key);
      }
    });

    const candidates: Candidate[] = [...groups.values()].map((group) => {
      const norm = Math.hypot(group.ax, group.ay) || 1;
      return {
        key: group.key,
        x: group.x / group.weight,
        y: group.y / group.weight,
        r: group.r / group.weight,
        ax: group.ax / norm,
        ay: group.ay / norm,
        strength: group.strength,
        joined: joined.has(group.key),
      };
    });

    candidates.sort((one, two) => two.strength - one.strength);
    return { candidates, joined };
  }

  function tick() {
    const layers = host.layers();
    if (layers.length === 0) {
      return;
    }

    while (states.length < layers.length) {
      states.push({ key: null, shown: 0, at: null });
    }

    const { candidates, joined } = collect();
    const step = gsap.ticker.deltaRatio(60) / 60;

    /* Weld hysteresis. Retrigger the hold for every pair whose raw test
       passes; prune pairs that are gone from the picture altogether, so a
       clean separation goes dark without waiting the hold out. */
    const now = gsap.ticker.time;
    joined.forEach((key) => weldedAt.set(key, now));
    const present = new Set<string>(joined);
    candidates.forEach((candidate) => present.add(candidate.key));
    [...weldedAt.keys()].forEach((key) => {
      if (!present.has(key)) {
        weldedAt.delete(key);
      }
    });
    const isWelded = (key: string) => {
      const at = weldedAt.get(key);
      return at !== undefined && now - at < WELD_HOLD;
    };

    /* The live joints, for feedback beyond the border (icon glow). Every
       tick, including the empty one — clearing is the host's cue. Joined
       pairs whose light has gone out (a drop fully swallowed) are reported
       too: the glow lives on THROUGH the deepest point of a merge. */
    if (host.joints) {
      const reported = new Set<string>();
      const live: SeamJoint[] = candidates.map((candidate) => {
        reported.add(candidate.key);
        const [ownerA, ownerB] = candidate.key.split("|");
        return {
          owners: [ownerA, ownerB] as [string, string],
          strength: candidate.strength,
          joined: isWelded(candidate.key),
          x: candidate.x,
          y: candidate.y,
        };
      });
      joined.forEach((key) => {
        if (!reported.has(key)) {
          const [ownerA, ownerB] = key.split("|");
          live.push({ owners: [ownerA, ownerB] as [string, string], strength: 0, joined: true });
        }
      });
      host.joints(live);
    }

    /* ONE LOBE PER BODY. Candidates arrive strongest first, so a body always
       takes its side from the joint it is most involved in and is spoken for
       after that: no rim is ever washed twice, and no body is left showing a
       neighbour's colour. A three-body cluster therefore lights all three,
       each in its own hue, from the two joints that make it. */
    interface Lobe {
      key: string;
      owner: string;
      x: number;
      y: number;
      r: number;
      strength: number;
    }
    const spoken = new Set<string>();
    const lobes: Lobe[] = [];
    for (const candidate of candidates) {
      const [ownerA, ownerB] = candidate.key.split("|");
      /* The axis runs from the sorted pair's first owner to its second, so
         each body's own side is the way AWAY from its partner. */
      for (const [owner, sign] of [
        [ownerA, -1],
        [ownerB, 1],
      ] as const) {
        if (spoken.has(owner)) {
          continue;
        }
        spoken.add(owner);
        lobes.push({
          /* Keyed by body AND joint: a body that changes partner is a
             different light, and gets to jump rather than slide. */
          key: `${owner}|${candidate.key}`,
          owner,
          x: candidate.x + candidate.ax * sign * candidate.r * LOBE_OFFSET,
          y: candidate.y + candidate.ay * sign * candidate.r * LOBE_OFFSET,
          r: candidate.r,
          strength: candidate.strength,
        });
      }
    }

    /* Layers keep the lobe they are already on — a light must never change
       hands mid-fade, or it would slide across the picture. Only a dark
       layer takes something new, and only then does it get to jump. */
    const taken = new Set<string>();
    const claimed = new Map<number, Lobe>();

    states.forEach((state, index) => {
      if (state.key === null || taken.has(state.key)) {
        return;
      }
      const held = lobes.find((lobe) => lobe.key === state.key);
      if (held) {
        claimed.set(index, held);
        taken.add(held.key);
      }
    });

    for (const lobe of lobes) {
      if (taken.has(lobe.key)) {
        continue;
      }

      /* Only a DARK layer may take a new lobe: a layer that still has light
         in it is still saying something about the body it is on, and
         re-pointing it mid-fade is a slide across the picture. A lobe with
         no dark layer to take it simply waits the hundred milliseconds until
         one goes out. */
      let pick = -1;
      states.forEach((state, index) => {
        if (claimed.has(index) || state.shown > SEAM_FREE) {
          return;
        }
        if (pick === -1 || state.shown < states[pick].shown) {
          pick = index;
        }
      });

      if (pick === -1) {
        break;
      }

      claimed.set(pick, lobe);
      taken.add(lobe.key);
    }

    states.forEach((state, index) => {
      const layer = layers[index];
      if (!layer || !layer.paint || !layer.gradient) {
        return;
      }

      const lobe = claimed.get(index) ?? null;
      const target = lobe ? lobe.strength : 0;

      /* Brightening a little quicker than it dims, the way a light does. Both
         on the clock, not per frame, so the refresh rate cannot change them. */
      const rate = target > state.shown ? SEAM_RISE : SEAM_FALL;
      state.shown += (target - state.shown) * (1 - Math.exp(-step / rate));

      if (lobe) {
        /* A dark layer lights up exactly where its lobe is; a lit one chases,
           because a seam's own point wanders as two rims roll around each
           other and a gradient re-centred hard every frame reads as a twitch. */
        if (state.at === null || state.key !== lobe.key) {
          state.at = { x: lobe.x, y: lobe.y, r: lobe.r };
          host.paint?.(index, lobe.owner, { x: lobe.x, y: lobe.y });
        } else {
          const chase = 1 - Math.exp(-step / SEAM_CHASE);
          state.at.x += (lobe.x - state.at.x) * chase;
          state.at.y += (lobe.y - state.at.y) * chase;
          state.at.r += (lobe.r - state.at.r) * chase;
          host.repaint?.(index, lobe.owner, { x: state.at.x, y: state.at.y });
        }

        state.key = lobe.key;
      }

      if (state.shown < 0.004) {
        state.shown = 0;
        state.key = null;
        state.at = null;
        layer.paint.style.opacity = "0";
        /* Hidden, not merely transparent: the mask that cuts this wash down
           to the rim runs the goo's blur a SECOND time, and a browser is only
           guaranteed to skip that work for something it is not painting. */
        layer.paint.style.visibility = "hidden";
        return;
      }

      if (state.at) {
        /* A slow, shallow breath — enough that a finger parked against a
           neighbour is not a dead decal, small enough that it never reads as
           the light moving. In phase across layers: two lights pulsing on
           different clocks beat against each other during a hand-over, which
           is half of what looked unsteady. */
        const breath = 1 + BREATH_DEPTH * Math.sin(gsap.ticker.time * BREATH_RATE);
        layer.gradient.setAttribute("cx", String(state.at.x));
        layer.gradient.setAttribute("cy", String(state.at.y));
        layer.gradient.setAttribute("r", String(state.at.r * breath));
      }

      layer.paint.style.visibility = "visible";
      layer.paint.style.opacity = String(state.shown);
    });
  }

  return {
    start() {
      if (running) {
        return;
      }
      running = true;
      gsap.ticker.add(tick);
    },
    kill() {
      if (running) {
        gsap.ticker.remove(tick);
        running = false;
      }
      states.length = 0;
      welded.clear();
      weldedAt.clear();
    },
  };
}
