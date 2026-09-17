export const FUMFIK_OPTIONS = {
  body: ['round', 'pear', 'bean', 'square'],
  ears: ['round', 'triangle', 'floppy', 'tiny'],
  eyes: ['dot', 'oval', 'sleepy', 'sparkle'],
  nose: ['oval', 'heart', 'button', 'triangle'],
  mouth: ['smile', 'grin', 'open', 'shy'],
  palette: ['coral', 'mint', 'sky', 'lemon', 'violet', 'berry'],
  background: ['plain', 'dots', 'waves', 'stars'],
} as const;

export type FumfikSpec = { [K in keyof typeof FUMFIK_OPTIONS]: (typeof FUMFIK_OPTIONS)[K][number] };
export type FumfikParameter = keyof FumfikSpec;
export const FUMFIK_REACTIONS = ['wink-right', 'wink-left', 'blink', 'smile', 'surprise', 'wiggle-ears', 'grow-nose', 'tongue-out',
  'shake-head', 'nod-head', 'hop', 'puff', 'spin'] as const;
export type FumfikReaction = (typeof FUMFIK_REACTIONS)[number];

export function randomReaction(previous?: FumfikReaction, random = Math.random, reducedMotion = false): FumfikReaction {
  const choices = FUMFIK_REACTIONS.filter(reaction => reaction !== previous
    && (!reducedMotion || ['wink-right', 'wink-left', 'blink', 'smile'].includes(reaction)));
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
}
export interface FumfikPose {
  leftBlink: number; rightBlink: number; smile: number; surprise: number;
  earWiggle: number; noseGrowth: number; tongueOut: number;
  headShake: number; headNod: number; hop: number; puff: number; turn: number;
}
export const REST_POSE: FumfikPose = {
  leftBlink: 0, rightBlink: 0, smile: 0, surprise: 0, earWiggle: 0, noseGrowth: 0, tongueOut: 0,
  headShake: 0, headNod: 0, hop: 0, puff: 0, turn: 0,
};
export const DEFAULT_FUMFIK: FumfikSpec = {
  body: 'round', ears: 'round', eyes: 'oval', nose: 'button', mouth: 'smile', palette: 'sky', background: 'plain',
};

export const PALETTES = {
  coral: { body: '#fb7185', ear: '#be3d66', inner: '#fecdd3', background: '#fff1f2', accent: '#fb7185' },
  mint: { body: '#4bd5ac', ear: '#138b79', inner: '#b5f6dc', background: '#edfcf5', accent: '#34b49b' },
  sky: { body: '#66c5ec', ear: '#368bb5', inner: '#c2edff', background: '#edf8ff', accent: '#64b9e2' },
  lemon: { body: '#f5d460', ear: '#cc8c38', inner: '#fff1ba', background: '#fffbeb', accent: '#e7bb3f' },
  violet: { body: '#b89beb', ear: '#8060b1', inner: '#e4d5ff', background: '#f6f1ff', accent: '#ad91dc' },
  berry: { body: '#ef87bc', ear: '#b44983', inner: '#ffdaed', background: '#fff0f8', accent: '#e591b9' },
} as const;

// The face is a single rig. Its local coordinates never depend on the SVG's displayed size.
export const BODY_GEOMETRY = {
  round: { path: 'M200 82 C268 82 318 132 318 199 C318 266 268 316 200 316 C132 316 82 266 82 199 C82 132 132 82 200 82Z', faceX: 200, faceY: 176, scale: 1, earX: 85, earY: 116 },
  pear: { path: 'M200 84 C258 84 275 124 281 165 C290 199 315 217 310 256 C305 301 256 325 200 325 C144 325 95 301 90 256 C85 217 110 199 119 165 C125 124 142 84 200 84Z', faceX: 200, faceY: 184, scale: 0.94, earX: 65, earY: 115 },
  bean: { path: 'M205 83 C282 68 329 126 313 192 C303 231 279 273 238 299 C195 328 126 306 100 262 C76 222 97 184 97 150 C97 112 146 94 205 83Z', faceX: 203, faceY: 175, scale: 0.95, earX: 80, earY: 113 },
  square: { path: 'M160 91 H240 Q313 91 313 164 V243 Q313 312 240 312 H160 Q87 312 87 243 V164 Q87 91 160 91Z', faceX: 200, faceY: 178, scale: 0.98, earX: 84, earY: 110 },
} as const;

export const EAR_PATHS = {
  round: 'M-34 0 A34 37 0 1 0 34 0 A34 37 0 1 0 -34 0Z',
  triangle: 'M-33 21 Q-35 15 -26 -45 Q-24 -55 -16 -49 L34 22Z',
  floppy: 'M-16 -16 C-67 -13 -65 72 -36 90 C-13 105 -11 54 12 25Z',
  tiny: 'M-22 0 A22 24 0 1 0 22 0 A22 24 0 1 0 -22 0Z',
} as const;

export const NOSE_PATHS = {
  oval: 'M-18 0 A18 12 0 1 0 18 0 A18 12 0 1 0 -18 0Z',
  heart: 'M0 14 C-32 -3 -17 -22 0 -9 C17 -22 32 -3 0 14Z',
  button: 'M-13 0 A13 13 0 1 0 13 0 A13 13 0 1 0 -13 0Z',
  triangle: 'M-18 -9 Q-22 -9 -18 -4 L-4 13 Q0 18 4 13 L18 -4 Q22 -9 18 -9Z',
} as const;

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => { const v = clamp(t); return v * v * (3 - 2 * v); };
const rounded = (n: number) => Number(n.toFixed(3));

export function mixPose(from: FumfikPose, to: FumfikPose, amount: number): FumfikPose {
  return Object.fromEntries(Object.keys(REST_POSE).map(key => [key, lerp(from[key as keyof FumfikPose], to[key as keyof FumfikPose], clamp(amount))])) as unknown as FumfikPose;
}

export function reactionTarget(reaction: FumfikReaction, intensity = 1): FumfikPose {
  const pose = { ...REST_POSE };
  // "Right" is the character's right eye, on the viewer's left.
  if (reaction === 'wink-right' || reaction === 'blink') pose.rightBlink = 1;
  if (reaction === 'wink-left' || reaction === 'blink') pose.leftBlink = 1;
  if (reaction === 'smile') pose.smile = clamp(intensity);
  if (reaction === 'surprise') pose.surprise = clamp(intensity);
  if (reaction === 'wiggle-ears') pose.earWiggle = clamp(intensity);
  if (reaction === 'grow-nose') pose.noseGrowth = clamp(intensity);
  if (reaction === 'tongue-out') pose.tongueOut = clamp(intensity);
  if (reaction === 'shake-head') pose.headShake = clamp(intensity);
  if (reaction === 'nod-head') pose.headNod = clamp(intensity);
  if (reaction === 'hop') pose.hop = clamp(intensity);
  if (reaction === 'puff') pose.puff = clamp(intensity);
  if (reaction === 'spin') pose.turn = 0.5;
  return pose;
}

export function reactionPose(reaction: FumfikReaction, progress: number, intensity = 1, start = REST_POSE): FumfikPose {
  const t = clamp(progress);
  if (t === 0) return { ...start };
  if (t === 1) return { ...REST_POSE };
  const target = reactionTarget(reaction, intensity);
  if (reaction === 'wiggle-ears') {
    target.earWiggle *= Math.sin(6 * Math.PI * t) * Math.sin(Math.PI * t) ** 2;
    return mixPose(start, target, smooth(t / 0.18));
  }
  if (reaction === 'shake-head' || reaction === 'nod-head') {
    const key = reaction === 'shake-head' ? 'headShake' : 'headNod';
    target[key] *= Math.sin(4 * Math.PI * t) * Math.sin(Math.PI * t) ** 2;
    return mixPose(start, target, smooth(t / 0.18));
  }
  if (reaction === 'hop') {
    target.hop *= Math.sin(Math.PI * smooth(t)) ** 2;
    return mixPose(start, target, smooth(t / 0.18));
  }
  if (reaction === 'spin') {
    const pose = mixPose(start, REST_POSE, smooth(t / 0.18));
    // Complete one forward turn; 360 degrees and the restored zero pose are visually identical.
    pose.turn = lerp(start.turn, 1, smooth(t));
    return pose;
  }
  if (t < 0.28) return mixPose(start, target, smooth(t / 0.28));
  if (t < 0.58) return target;
  return mixPose(target, REST_POSE, smooth((t - 0.58) / 0.42));
}

export function headGeometry(pose: FumfikPose) {
  const x = 200 + 12 * pose.headShake;
  const y = 200 + 6 * pose.headNod - 40 * pose.hop;
  const rotation = 7 * pose.headShake + 360 * pose.turn;
  const scale = 1 + 0.2 * pose.puff;
  const scaleX = scale * (1 - 0.08 * Math.abs(pose.headShake));
  const scaleY = scale * (1 - 0.12 * Math.abs(pose.headNod));
  return {
    transform: `translate(${rounded(x)} ${rounded(y)}) rotate(${rounded(rotation)}) scale(${rounded(scaleX)} ${rounded(scaleY)}) translate(-200 -200)`,
    faceX: 12 * pose.headShake, faceY: 12 * pose.headNod,
    shadowRadius: 85 - 25 * pose.hop, shadowOpacity: 0.08 - 0.04 * pose.hop,
    x, y, rotation, scaleX, scaleY,
  };
}

export function earTransform(kind: FumfikSpec['ears'], pose: FumfikPose): string {
  const pivot = kind === 'floppy' ? 6 : 26;
  return `rotate(${rounded(pose.earWiggle * 26)} 0 ${pivot})`;
}

export function noseTransform(pose: FumfikPose): string {
  const growth = clamp(pose.noseGrowth);
  return `translate(0 ${rounded(35 + growth * 2)}) scale(${rounded(1 + growth * 0.8)})`;
}

export function eyeGeometry(kind: FumfikSpec['eyes'], blink: number, surprise: number) {
  const rx = kind === 'sparkle' ? 23 : kind === 'dot' ? 15 : 17;
  const ry = kind === 'dot' ? 17 : 22;
  const restingOpen = kind === 'sleepy' ? 0.28 : 1;
  const open = lerp(restingOpen, 1, clamp(surprise)) * (1 - clamp(blink));
  const points = Array.from({ length: 40 }, (_, index) => {
    const angle = -Math.PI / 2 + index / 40 * Math.PI * 2;
    const starRadius = kind === 'sparkle' ? lerp(1, 0.5, Math.abs(Math.sin(index / 8 * Math.PI))) : 1;
    const x = Math.cos(angle) * rx * starRadius;
    const y = Math.sin(angle) * ry * starRadius * open - 5 * (1 - (x / rx) ** 2) * (1 - open);
    return `${rounded(x)},${rounded(y)}`;
  });
  return { path: `M${points.join(' L')}Z`, highlight: open * open, openness: open };
}

const MOUTHS = {
  smile: { width: 72, top: 17, bottom: 17, teeth: 0 },
  grin: { width: 82, top: 3, bottom: 34, teeth: 1 },
  open: { width: 43, top: -21, bottom: 27, teeth: 0 },
  shy: { width: 38, top: 10, bottom: 10, teeth: 0 },
};

export function mouthGeometry(kind: FumfikSpec['mouth'], pose: FumfikPose) {
  const base = MOUTHS[kind];
  const smile = clamp(pose.smile);
  const surprise = clamp(pose.surprise);
  const tongueOut = clamp(pose.tongueOut);
  const width = lerp(lerp(lerp(base.width, 92, smile), 39, surprise), 68, tongueOut);
  const top = lerp(lerp(lerp(base.top, 5, smile), -22, surprise), -5, tongueOut);
  const bottom = lerp(lerp(lerp(base.bottom, 35, smile), 28, surprise), 23, tongueOut);
  const teeth = lerp(lerp(lerp(base.teeth, 1, smile), 0, surprise), 0, tongueOut);
  const half = width / 2;
  const bend = width * 0.36;
  const path = `M${-half} 0 C${-bend} ${top} ${bend} ${top} ${half} 0 C${bend} ${bottom} ${-bend} ${bottom} ${-half} 0Z`;
  const tongueHalf = lerp(21, 15, tongueOut);
  const tongueRoot = lerp(16, 5, tongueOut);
  const tongueTip = lerp(42, 48, tongueOut);
  const tonguePath = `M${-tongueHalf} ${tongueRoot} Q0 ${tongueRoot - 4} ${tongueHalf} ${tongueRoot} L${tongueHalf} ${tongueTip - 14} C${tongueHalf} ${tongueTip + 4} ${-tongueHalf} ${tongueTip + 4} ${-tongueHalf} ${tongueTip - 14}Z`;
  // The tongue is clipped inside the mouth at rest; only the lower lip opens for protrusion.
  const tongueExit = bottom * 0.75 - 4;
  const tongueExtension = `M-20 ${tongueExit} H20 V${tongueExit + 50 * tongueOut} H-20Z`;
  return {
    path, teeth, tongue: lerp(clamp((bottom - top - 10) / 25), 1, tongueOut), width, top, bottom,
    offset: 78 + clamp(pose.noseGrowth) * 18,
    tonguePath, tongueExtension, tongueOut,
  };
}

export function specQuery(spec: FumfikSpec): string {
  return new URLSearchParams(Object.entries(spec)).toString();
}

export function randomSpec(random = Math.random): FumfikSpec {
  return Object.fromEntries(Object.entries(FUMFIK_OPTIONS).map(([key, values]) => [key, values[Math.min(values.length - 1, Math.floor(random() * values.length))]])) as FumfikSpec;
}
