export type PersonKind = 'child' | 'princess' | 'dad' | 'mom';
export type FurnitureKind = 'chair' | 'table' | 'wardrobe' | 'toy';
export type DesignKind = 'person' | 'furniture' | 'box' | 'house';
export interface PersonSpec {
  kind: PersonKind; skin: string; hair: string; hairStyle: 'short' | 'bob' | 'long' | 'buns';
  outfit: 'casual' | 'dress' | 'overalls' | 'royal'; clothing: string; accent: string;
}
export interface FurnitureSpec {
  kind: FurnitureKind; color: string; accent: string; style: 'round' | 'square';
  detail: 'plain' | 'stars' | 'hearts'; toy: 'bear' | 'blocks' | 'car';
}
export interface BoxSpec {
  color: string; ribbon: string; patternColor: string; pattern: 'plain' | 'dots' | 'stars' | 'stripes';
  inflation: 'puff' | 'spin' | 'wobble' | 'bounce'; burst: 'confetti' | 'bubbles' | 'stars' | 'none';
  delay: number; duration: number; intensity: number; particles: number;
}
export interface HouseSpec {
  kind: 'cottage' | 'townhouse' | 'castle'; wall: string; roof: string; floor: string;
  wallpaper: 'plain' | 'dots' | 'stripes'; floors: number; rooms: number; cost: number;
}
export type Reward = { kind: 'person'; spec: PersonSpec } | { kind: 'furniture'; spec: FurnitureSpec };
export type Design = { id: string; name: string } & (Reward | { kind: 'box'; spec: BoxSpec } | { kind: 'house'; spec: HouseSpec });
export interface Placement { id: string; name: string; reward: Reward; x: number; y: number; size: number; flipped: boolean }
export interface SuperboxDocument {
  version: 1; box: BoxSpec; person: PersonSpec; furniture: FurnitureSpec; house: HouseSpec;
  library: Design[]; placements: Placement[]; rewardId: string; fumfiks: number;
}
export const DEFAULT_PERSON: PersonSpec = { kind: 'princess', skin: '#efbe9e', hair: '#713e33', hairStyle: 'long', outfit: 'royal', clothing: '#bba1ed', accent: '#ffdc8b' };
export const DEFAULT_FURNITURE: FurnitureSpec = { kind: 'chair', color: '#c39166', accent: '#a7c8b6', style: 'round', detail: 'plain', toy: 'bear' };
export const DEFAULT_BOX: BoxSpec = { color: '#d9857c', ribbon: '#ffe3a8', patternColor: '#ffe4cd', pattern: 'stars', inflation: 'wobble', burst: 'confetti', delay: 800, duration: 2000, intensity: 1, particles: 52 };
export const DEFAULT_HOUSE: HouseSpec = { kind: 'cottage', wall: '#f6e5d4', roof: '#a5c3b5', floor: '#bc8c68', wallpaper: 'dots', floors: 2, rooms: 2, cost: 50 };
export const PERSON_LABELS: Record<PersonKind, string> = { child: 'Dítě', princess: 'Princezna', dad: 'Táta', mom: 'Máma' };
export const FURNITURE_LABELS: Record<FurnitureKind, string> = { chair: 'Židle', table: 'Stůl', wardrobe: 'Skříň', toy: 'Hračka' };
export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function defaultDocument(): SuperboxDocument {
  const library: Design[] = [
    { id: 'princess', name: 'Levandulová princezna', kind: 'person', spec: { ...DEFAULT_PERSON } },
    { id: 'child', name: 'Malý objevitel', kind: 'person', spec: { ...DEFAULT_PERSON, kind: 'child', hairStyle: 'short', outfit: 'overalls', clothing: '#91b5ca', accent: '#f8d890' } },
    { id: 'mom', name: 'Máma v šatech', kind: 'person', spec: { ...DEFAULT_PERSON, kind: 'mom', hairStyle: 'bob', outfit: 'dress', clothing: '#b9cbb3' } },
    { id: 'dad', name: 'Táta v pruhovaném', kind: 'person', spec: { ...DEFAULT_PERSON, kind: 'dad', hairStyle: 'short', outfit: 'casual', clothing: '#d39c84', accent: '#f5e5cf' } },
    ...(['chair', 'table', 'wardrobe', 'toy'] as FurnitureKind[]).map(kind => ({ id: kind, name: ({ chair: 'Mátová židle', table: 'Kulatý stoleček', wardrobe: 'Skříň na poklady', toy: 'Medvídek' })[kind], kind: 'furniture' as const, spec: { ...DEFAULT_FURNITURE, kind } })),
  ];
  return { version: 1, box: { ...DEFAULT_BOX }, person: { ...DEFAULT_PERSON }, furniture: { ...DEFAULT_FURNITURE }, house: { ...DEFAULT_HOUSE }, library, rewardId: 'princess', fumfiks: 50, placements: [
    { id: 'initial-child', name: 'Malý objevitel', reward: clone(library[1]) as Reward, x: 29, y: 79, size: 18, flipped: false },
    { id: 'initial-chair', name: 'Mátová židle', reward: clone(library[4]) as Reward, x: 70, y: 82, size: 19, flipped: false },
    { id: 'initial-bear', name: 'Medvídek', reward: clone(library[7]) as Reward, x: 70, y: 45, size: 15, flipped: false },
  ] };
}

export const totalDuration = (spec: BoxSpec): number => spec.delay + spec.duration + 1500;
export function boxFrame(spec: BoxSpec, elapsed: number) {
  const inflation = clamp((elapsed - spec.delay) / spec.duration, 0, 1);
  const burst = clamp((elapsed - spec.delay - spec.duration) / 1500, 0, 1);
  const opened = elapsed >= spec.delay + spec.duration;
  const amount = inflation * spec.intensity;
  let sx = 1 + amount * .25, sy = sx, rotation = 0, y = 0;
  if (spec.inflation === 'spin') rotation = 1080 * inflation ** 3;
  if (spec.inflation === 'wobble') { sx += Math.sin(inflation * Math.PI * 9) * amount * .17; sy -= Math.sin(inflation * Math.PI * 9) * amount * .17; rotation = Math.sin(inflation * Math.PI * 13) * amount * 9; }
  if (spec.inflation === 'bounce') { y = -Math.abs(Math.sin(inflation * Math.PI * 5)) * amount * 38; sy += Math.sin(inflation * Math.PI * 10) * amount * .13; }
  if (spec.inflation === 'puff') { sx += Math.sin(inflation * Math.PI * 6) * amount * .08; sy = sx; }
  return { inflation, burst, opened, transform: `translate(300 ${285 + y}) rotate(${rotation}) scale(${sx} ${sy}) translate(-300 -285)`, phase: (opened ? (burst < 1 ? 'burst' : 'reward') : inflation > 0 ? 'inflating' : 'waiting') as 'waiting' | 'inflating' | 'burst' | 'reward' };
}

export function particleFrame(index: number, count: number, progress: number, bubbles: boolean) {
  const angle = index * 2.399963229728653;
  const spread = 105 + ((index * 47) % 145);
  const t = clamp(progress, 0, 1);
  const travel = 1 - (1 - t) ** 3;
  return {
    x: 300 + Math.cos(angle) * spread * travel,
    y: 270 + Math.sin(angle) * spread * .65 * travel + (bubbles ? -150 * t * t : 155 * t * t),
    rotation: index * 53 + t * (index % 2 ? 500 : -420),
    opacity: t >= 1 ? 0 : Math.min(1, t * 18) * (1 - clamp((t - .55) / .45, 0, 1)),
    radius: bubbles ? 5 + (index % 5) * 3 : 3 + (index % 3),
  };
}

// Positions use percentages of the entire house canvas, so touch and mouse share
// the same bounds at every viewport size. Artwork is always a square footprint.
export function boundPlacement(item: Placement, house: HouseSpec): Placement {
  const size = clamp(item.size, 10, 28);
  return { ...item, size, x: clamp(item.x, 10 + size / 2, 90 - size / 2), y: clamp(item.y, 28 + size / 2, 93 - size / 2) };
}

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const color = (value: unknown): boolean => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
const oneOf = (value: unknown, values: readonly string[]): boolean => typeof value === 'string' && values.includes(value);
const numberIn = (value: unknown, min: number, max: number): boolean => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const shortText = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0 && value.length <= 80;
export function validSpec(kind: DesignKind, value: unknown): boolean {
  if (!isObject(value)) return false;
  const v = value;
  if (kind === 'person') return oneOf(v['kind'], ['child', 'princess', 'dad', 'mom']) && ['skin', 'hair', 'clothing', 'accent'].every(k => color(v[k])) && oneOf(v['hairStyle'], ['short', 'bob', 'long', 'buns']) && oneOf(v['outfit'], ['casual', 'dress', 'overalls', 'royal']);
  if (kind === 'furniture') return oneOf(v['kind'], ['chair', 'table', 'wardrobe', 'toy']) && color(v['color']) && color(v['accent']) && oneOf(v['style'], ['round', 'square']) && oneOf(v['detail'], ['plain', 'stars', 'hearts']) && oneOf(v['toy'], ['bear', 'blocks', 'car']);
  if (kind === 'box') return ['color', 'ribbon', 'patternColor'].every(k => color(v[k])) && oneOf(v['pattern'], ['plain', 'dots', 'stars', 'stripes']) && oneOf(v['inflation'], ['puff', 'spin', 'wobble', 'bounce']) && oneOf(v['burst'], ['confetti', 'bubbles', 'stars', 'none']) && numberIn(v['delay'], 0, 3000) && numberIn(v['duration'], 600, 5000) && numberIn(v['intensity'], .3, 1.5) && numberIn(v['particles'], 12, 80) && Number.isInteger(v['particles']);
  return oneOf(v['kind'], ['cottage', 'townhouse', 'castle']) && ['wall', 'roof', 'floor'].every(k => color(v[k])) && oneOf(v['wallpaper'], ['plain', 'dots', 'stripes']) && numberIn(v['floors'], 1, 3) && Number.isInteger(v['floors']) && numberIn(v['rooms'], 1, 3) && Number.isInteger(v['rooms']) && numberIn(v['cost'], 1, 1000) && Number.isInteger(v['cost']);
}
export function parseDocument(json: string): SuperboxDocument {
  const fail = (): never => { throw new Error('Soubor neobsahuje platný návrh Superbox labu (verze 1).'); };
  if (json.length > 600_000) return fail();
  let value: unknown;
  try { value = JSON.parse(json); } catch { return fail(); }
  if (!isObject(value) || value['version'] !== 1) return fail();
  for (const kind of ['box', 'person', 'furniture', 'house'] as const) if (!validSpec(kind, value[kind])) return fail();
  const library = value['library'], placements = value['placements'];
  if (!Array.isArray(library) || library.length > 100 || !library.every(d => isObject(d) && shortText(d['id']) && shortText(d['name']) && oneOf(d['kind'], ['box', 'person', 'furniture', 'house']) && validSpec(d['kind'] as DesignKind, d['spec']))) return fail();
  if (new Set(library.map(d => d.id)).size !== library.length) return fail();
  if (!Array.isArray(placements) || placements.length > 40 || !placements.every(p => isObject(p) && shortText(p['id']) && shortText(p['name']) && isObject(p['reward']) && oneOf(p['reward']['kind'], ['person', 'furniture']) && validSpec(p['reward']['kind'] as DesignKind, p['reward']['spec']) && numberIn(p['x'], 0, 100) && numberIn(p['y'], 0, 100) && numberIn(p['size'], 10, 28) && typeof p['flipped'] === 'boolean')) return fail();
  if (new Set(placements.map(p => p.id)).size !== placements.length) return fail();
  if (!numberIn(value['fumfiks'], 0, 1000) || !Number.isInteger(value['fumfiks']) || typeof value['rewardId'] !== 'string') return fail();
  const doc = value as unknown as SuperboxDocument;
  if (!doc.library.some(d => d.id === doc.rewardId && (d.kind === 'person' || d.kind === 'furniture'))) return fail();
  doc.placements = doc.placements.map(p => boundPlacement(p, doc.house));
  return doc;
}
