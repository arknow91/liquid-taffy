/* The liquid family's VOICE — a tiny procedural synth for gooey sounds.

   No samples. Every hit is built on the spot, so nothing ever repeats
   exactly: a drop landing twice sounds like the same drop landing twice,
   not like a file played twice. That is the whole reason UI audio made of
   samples feels dead — the ear catches the loop long before the eye does.

   ONE voice, shaped ten ways. Every sound here is the same little machine:

     a body   — an oscillator sliding from one pitch to another; the slide IS
                the viscosity, a fast one reads as watery, a slow one as thick
     a throat — a resonant lowpass sweeping with it; the resonance is the
                hollow "bloop" of a bubble, and where the sweep ends decides
                whether the sound is wet or dry
     a wobble — a slow LFO bent into the pitch: jelly, the same overshoot the
                springs give the picture
     a smack  — a whisper of filtered noise at the attack, the contact itself
     an envelope — attack and decay, and these are the character controls:
                everything above is a shape, the envelope is how hard and how
                long you press it

   And two CHARACTERS, one per frame, because the two stages are different
   rooms. Light is a shallow dish of water: higher, brighter, drier, quick to
   die. Dark is a deep vessel of syrup: lower, darker, wetter, resonant, slow
   to let go. Nothing else changes — same machine, same gestures, the room
   around it is what differs. */

export type GooFrame = "light" | "dark";

/* The character controls. Everything is a MULTIPLIER on the authored shape
   below, so a frame is described by how it differs, not by a second set of
   numbers that can drift out of step with the first. */
export interface GooCharacter {
  /* Both ends of the pitch slide. */
  pitch: number;
  /* How far the slide travels — the viscosity dial. */
  glide: number;
  /* The envelope: the two knobs that shape every sound here. */
  attack: number;
  decay: number;
  /* Where the throat opens to, and how hollow it rings. */
  brightness: number;
  resonance: number;
  /* Jelly, and the wet contact noise. */
  wobble: number;
  wet: number;
  gain: number;
}

const FRAMES: Record<GooFrame, GooCharacter> = {
  light: {
    pitch: 1.24,
    glide: 0.85,
    attack: 0.85,
    decay: 0.8,
    brightness: 1.7,
    resonance: 0.7,
    wobble: 0.8,
    wet: 0.75,
    gain: 0.85,
  },
  dark: {
    pitch: 0.78,
    glide: 1.2,
    attack: 1.2,
    decay: 1.25,
    brightness: 0.68,
    resonance: 1.35,
    wobble: 1.25,
    wet: 1.2,
    gain: 1,
  },
};

/* One authored sound: the shape before a frame's character is applied. */
interface GooShape {
  from: number;
  to: number;
  attack: number;
  decay: number;
  cutoffFrom: number;
  cutoffTo: number;
  q: number;
  wobbleRate: number;
  wobbleDepth: number;
  wet: number;
  gain: number;
  type?: OscillatorType;
}

/* The gestures the family actually makes. Read them as a sentence: a pour
   rises, a collapse falls, a catch is short and soft, a weld swells and
   settles, a release snaps, a full set cheers, a tick is a drip, a slide is
   the pill changing seats, a pop is ONE drop leaving the button and a land
   is that same drop falling back into it. */
const SHAPES: Record<string, GooShape> = {
  /* The fan opening / the panel pouring out: up, and opening as it goes. */
  open: {
    from: 190, to: 430, attack: 0.012, decay: 0.28,
    cutoffFrom: 420, cutoffTo: 1900, q: 7, wobbleRate: 11, wobbleDepth: 26,
    wet: 0.05, gain: 0.16,
  },
  /* Collapsing back into the button: down, closing, with a wet tail. */
  close: {
    from: 380, to: 140, attack: 0.008, decay: 0.24,
    cutoffFrom: 1700, cutoffTo: 320, q: 8, wobbleRate: 9, wobbleDepth: 20,
    wet: 0.07, gain: 0.16,
  },
  /* Taking hold of a drop — short, soft, almost swallowed. */
  grab: {
    from: 240, to: 300, attack: 0.006, decay: 0.1,
    cutoffFrom: 700, cutoffTo: 1200, q: 5, wobbleRate: 14, wobbleDepth: 12,
    wet: 0.06, gain: 0.1,
  },
  /* Two rims becoming one: a swell that settles — the deepest, roundest
     sound here, because it is the one moment two masses become one. */
  weld: {
    from: 150, to: 250, attack: 0.016, decay: 0.34,
    cutoffFrom: 300, cutoffTo: 1100, q: 11, wobbleRate: 7, wobbleDepth: 34,
    wet: 0.04, gain: 0.13, type: "triangle",
  },
  /* Letting go: the snap of a stretched rim closing up. */
  release: {
    from: 330, to: 180, attack: 0.004, decay: 0.16,
    cutoffFrom: 1500, cutoffTo: 500, q: 6, wobbleRate: 16, wobbleDepth: 18,
    wet: 0.09, gain: 0.12,
  },
  /* The full set, taking its bow: the one sound here that is allowed to be
     pleased with itself — a long rise that keeps opening, the throat swung
     wide. Still the same machine, just held down longer. */
  cheer: {
    from: 260, to: 700, attack: 0.02, decay: 0.5,
    cutoffFrom: 500, cutoffTo: 3000, q: 6, wobbleRate: 9, wobbleDepth: 30,
    wet: 0.05, gain: 0.15, type: "triangle",
  },
  /* One drop firing out of the button. Deliberately small: the speed dial
     throws three of these a breath apart, and what should read is the FAN —
     three light knocks in a row, not three announcements. Each is pitched by
     its caller (see `pitch`), so the three make a little rising figure
     across the arc rather than the same note three times. */
  pop: {
    from: 300, to: 520, attack: 0.004, decay: 0.14,
    cutoffFrom: 600, cutoffTo: 2100, q: 6, wobbleRate: 15, wobbleDepth: 14,
    wet: 0.05, gain: 0.085,
  },
  /* One drop falling back into the button — the pop played backwards in
     spirit: down instead of up, and wetter, because arriving in a mass is a
     wetter event than leaving one. Pitched by its caller too, so the three
     land as a falling figure in the order they actually dive: last out,
     first in. */
  land: {
    from: 400, to: 195, attack: 0.004, decay: 0.13,
    cutoffFrom: 1500, cutoffTo: 430, q: 7, wobbleRate: 12, wobbleDepth: 16,
    wet: 0.08, gain: 0.09,
  },
  /* A pill row changing seats. The quietest thing here on purpose: a switch
     is not an event in the liquid, it is the stage being re-dressed, and a
     sound that competes with the surfaces would make every glance at the
     tabs feel like an action. Its glide follows the TRAVEL — right rises,
     left falls (see `direction`), so the ear hears which way the pill went. */
  slide: {
    from: 300, to: 430, attack: 0.005, decay: 0.13,
    cutoffFrom: 900, cutoffTo: 1900, q: 4, wobbleRate: 13, wobbleDepth: 12,
    wet: 0.035, gain: 0.07,
  },
  /* A row taking its tick: one drip, high and brief. */
  tick: {
    from: 520, to: 760, attack: 0.004, decay: 0.11,
    cutoffFrom: 1200, cutoffTo: 2600, q: 4, wobbleRate: 18, wobbleDepth: 10,
    wet: 0.05, gain: 0.09,
  },
};

export type GooSound = keyof typeof SHAPES;

export interface GooOptions {
  frame?: GooFrame;
  /* How hard the gesture was, 0..1-ish. Scales loudness and pitch a little —
     the same hit harder, not a different hit. */
  force?: number;
  /* Flips the pitch slide. "down" mirrors the authored glide around its own
     start, so a sound that rises can fall without a second shape to keep in
     step with the first. */
  direction?: "up" | "down";
  /* Transposes this one hit. For sounds a caller fires several of at once —
     three drops leaving one button — so they read as a figure instead of a
     stutter on one note. */
  pitch?: number;
  /* Which bucket the repeat-gate counts in. Two voices that belong to the
     SAME instant — the two bodies of one weld, each speaking in its own
     pitch — would otherwise silence each other, since the gate only knows
     the sound's name. Give them a key each and the pair sounds as a pair. */
  key?: string;
}

/* Repeats of the same sound closer together than this are dropped: a grab
   that re-fires every few frames would buzz rather than speak. */
const GATE_MS: Partial<Record<GooSound, number>> = {
  slide: 60,
  grab: 70,
  weld: 90,
  release: 70,
  tick: 40,
};

class GooSfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private readonly gates: Record<string, number> = {};

  /* Built on the FIRST sound, which is always inside a user gesture (every
     caller here is a pointer or click handler) — a context created any
     earlier would just sit blocked by the autoplay policy. */
  private audio() {
    if (typeof window === "undefined" || this.muted) {
      return null;
    }
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        return null;
      }
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  mute(on = true) {
    this.muted = on;
    return this;
  }

  volume(value: number) {
    if (this.master) {
      this.master.gain.value = value;
    }
    return this;
  }

  private open(name: GooSound, key = name) {
    const ms = GATE_MS[name];
    if (!ms) {
      return true;
    }
    const now = performance.now();
    if (this.gates[key] && now - this.gates[key] < ms) {
      return false;
    }
    this.gates[key] = now;
    return true;
  }

  /* A short burst of noise for the contact itself — the sound of two wet
     surfaces meeting, without which the whole thing reads as a beep. */
  private smack(ctx: AudioContext, at: number, level: number, tone: number) {
    if (level <= 0.001 || !this.master) {
      return;
    }
    const length = Math.max(1, Math.floor(ctx.sampleRate * 0.05));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      /* Decaying, not flat: a smack is an event, not a hiss. */
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = tone;
    band.Q.value = 1.1;
    const gain = ctx.createGain();
    gain.gain.value = level;
    source.connect(band);
    band.connect(gain);
    gain.connect(this.master);
    source.start(at);
  }

  play(name: GooSound, options: GooOptions = {}) {
    const shape = SHAPES[name];
    if (!shape || !this.open(name, options.key)) {
      return this;
    }
    const ctx = this.audio();
    if (!ctx || !this.master) {
      return this;
    }

    const character = FRAMES[options.frame ?? "light"];
    const force = Math.min(1.4, Math.max(0.2, options.force ?? 1));
    const at = ctx.currentTime;

    /* Every hit is a touch different — the small random spread is what keeps
       a repeated gesture from sounding like one file played twice. */
    const drift = 1 + (Math.random() - 0.5) * 0.1;
    const from = shape.from * character.pitch * (options.pitch ?? 1) * drift;
    const swing = (shape.to - shape.from) * character.pitch * character.glide * drift;
    const to = from + (options.direction === "down" ? -swing : swing);
    const attack = shape.attack * character.attack;
    const decay = shape.decay * character.decay;

    const body = ctx.createOscillator();
    body.type = shape.type ?? "sine";
    body.frequency.setValueAtTime(from, at);
    body.frequency.exponentialRampToValueAtTime(Math.max(40, to), at + attack + decay * 0.8);

    /* The jelly: a slow bend in the pitch, the ear's version of the
       overshoot the springs put in the picture. */
    const wobble = ctx.createOscillator();
    wobble.type = "sine";
    wobble.frequency.value = shape.wobbleRate;
    const wobbleDepth = ctx.createGain();
    wobbleDepth.gain.value = shape.wobbleDepth * character.wobble;
    wobble.connect(wobbleDepth);
    wobbleDepth.connect(body.frequency);

    /* The throat: where the sound is hollow, and how far it opens. */
    const throat = ctx.createBiquadFilter();
    throat.type = "lowpass";
    throat.Q.value = shape.q * character.resonance;
    throat.frequency.setValueAtTime(shape.cutoffFrom * character.brightness, at);
    throat.frequency.exponentialRampToValueAtTime(
      Math.max(80, shape.cutoffTo * character.brightness),
      at + attack + decay,
    );

    /* The envelope — the character control that matters most: how hard the
       shape is pressed, and how long it is held. */
    const level = ctx.createGain();
    const peak = Math.max(0.0002, shape.gain * character.gain * force);
    level.gain.setValueAtTime(0.0001, at);
    level.gain.exponentialRampToValueAtTime(peak, at + attack);
    level.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);

    body.connect(throat);
    throat.connect(level);
    level.connect(this.master);

    body.start(at);
    wobble.start(at);
    const until = at + attack + decay + 0.05;
    body.stop(until);
    wobble.stop(until);

    this.smack(ctx, at, shape.wet * character.wet * force, shape.cutoffTo * character.brightness);
    return this;
  }
}

/* One voice for the whole family — the surfaces share a stage, so they share
   a throat. */
export const gooSfx = new GooSfx();
