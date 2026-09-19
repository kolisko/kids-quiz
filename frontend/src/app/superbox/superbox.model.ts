export type PersonKind = 'baby' | 'girl' | 'boy' | 'woman' | 'man' | 'grandpa' | 'grandma';
export type FurnitureKind = 'chair' | 'table' | 'wardrobe' | 'toy';
export type DesignKind = 'person' | 'furniture' | 'box' | 'house';
export interface PersonSpec {
  kind: PersonKind; skin: string; hair: string;
  face: 'round' | 'oval' | 'chubby' | 'slim' | 'gaunt';
  eyes: 'round' | 'oval' | 'almond' | 'narrow' | 'sleepy';
  build: 'slim' | 'regular' | 'stocky'; wrinkles: number;
  hairStyle: 'tuft' | 'baby-curls' | 'bald' | 'short' | 'sidepart' | 'curly-short' | 'mohawk' | 'bob' | 'long' | 'curly-long' | 'braids' | 'high-braids' | 'ponytail' | 'pigtails' | 'bun' | 'buns' | 'floor-length';
  fringe: boolean; facialHair: 'none' | 'mustache' | 'beard'; crown: boolean;
  top: 'onesie' | 'tshirt' | 'long-sleeve' | 'tank' | 'long-top' | 'jacket' | 'hoodie' | 'bra';
  bottom: 'diaper' | 'pants' | 'shorts' | 'skirt' | 'long-skirt' | 'floor-skirt' | 'royal-skirt' | 'mini-skirt';
  shoes: 'booties' | 'sneakers' | 'boots' | 'sandals' | 'clogs' | 'slippers' | 'heels';
  topColor: string; bottomColor: string; shoeColor: string; accent: string;
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
  version: 2; box: BoxSpec; person: PersonSpec; furniture: FurnitureSpec; house: HouseSpec;
  library: Design[]; placements: Placement[]; rewardId: string; fumfiks: number;
}
export const DEFAULT_PERSON: PersonSpec = {
  kind: 'girl', skin: '#efbe9e', hair: '#713e33', face: 'round', eyes: 'oval', build: 'regular', wrinkles: 0,
  hairStyle: 'long', fringe: false, facialHair: 'none', crown: true,
  top: 'tank', bottom: 'royal-skirt', shoes: 'sandals', topColor: '#bba1ed', bottomColor: '#bba1ed', shoeColor: '#765a70', accent: '#ffdc8b',
};
export const DEFAULT_FURNITURE: FurnitureSpec = { kind: 'chair', color: '#c39166', accent: '#a7c8b6', style: 'round', detail: 'plain', toy: 'bear' };
export const DEFAULT_BOX: BoxSpec = { color: '#d9857c', ribbon: '#ffe3a8', patternColor: '#ffe4cd', pattern: 'stars', inflation: 'wobble', burst: 'confetti', delay: 800, duration: 2000, intensity: 1, particles: 52 };
export const DEFAULT_HOUSE: HouseSpec = { kind: 'cottage', wall: '#f6e5d4', roof: '#a5c3b5', floor: '#bc8c68', wallpaper: 'dots', floors: 2, rooms: 2, cost: 50 };
export const PERSON_LABELS: Record<PersonKind, string> = { baby: 'Miminko', girl: 'Dívka', boy: 'Chlapec', woman: 'Žena', man: 'Muž', grandpa: 'Dědeček', grandma: 'Babička' };
export const PERSON_FACE_LABELS: Record<PersonSpec['face'], string> = { round: 'Kulatý', oval: 'Oválný', chubby: 'Baculaté tváře', slim: 'Hubený', gaunt: 'Vychrtlý' };
export const PERSON_EYE_LABELS: Record<PersonSpec['eyes'], string> = { round: 'Kulaté', oval: 'Oválné', almond: 'Mandlové', narrow: 'Úzké', sleepy: 'Přivřené' };
export const PERSON_BUILD_LABELS: Record<PersonSpec['build'], string> = { slim: 'Štíhlá', regular: 'Střední', stocky: 'Baculatá' };
export const PERSON_HAIR_LABELS: Record<PersonSpec['hairStyle'], string> = {
  tuft: 'Chmýří', 'baby-curls': 'Dětské kudrlinky', bald: 'Bez vlasů', short: 'Krátký sestřih', sidepart: 'Pěšinka', 'curly-short': 'Krátké kudrny', mohawk: 'Číro',
  bob: 'Mikádo', long: 'Dlouhé vlasy', 'curly-long': 'Dlouhé kudrny', braids: 'Dva copy', 'high-braids': 'Copánky shora', ponytail: 'Jeden culík', pigtails: 'Dva culíky', bun: 'Jeden drdol', buns: 'Dva drdoly', 'floor-length': 'Vlasy až na zem',
};
export const PERSON_TOP_LABELS: Record<PersonSpec['top'], string> = { onesie: 'Kojenecké body', tshirt: 'Tričko', 'long-sleeve': 'Triko s dlouhým rukávem', tank: 'Topík', 'long-top': 'Topík s dlouhým rukávem', jacket: 'Bunda', hoodie: 'Mikina', bra: 'Podprsenka' };
export const PERSON_BOTTOM_LABELS: Record<PersonSpec['bottom'], string> = { diaper: 'Plenka', pants: 'Kalhoty', shorts: 'Kraťasy', skirt: 'Sukně', 'long-skirt': 'Dlouhá sukně', 'floor-skirt': 'Sukně až na zem', 'royal-skirt': 'Princeznovská sukně', 'mini-skirt': 'Minisukně' };
export const PERSON_SHOE_LABELS: Record<PersonSpec['shoes'], string> = { booties: 'Capáčky', heels: 'Podpatky', sneakers: 'Tenisky', boots: 'Holínky', sandals: 'Sandály', clogs: 'Kroksy', slippers: 'Bačkory s bambulí' };
export const PERSON_BEARD_LABELS: Record<PersonSpec['facialHair'], string> = { none: 'Bez vousů', mustache: 'Knír', beard: 'Vousy' };
interface PersonOptions {
  hairStyles: readonly PersonSpec['hairStyle'][]; tops: readonly PersonSpec['top'][];
  bottoms: readonly PersonSpec['bottom'][]; shoes: readonly PersonSpec['shoes'][];
}
const EVERYDAY_SHOES: PersonSpec['shoes'][] = ['sneakers', 'boots', 'sandals', 'clogs', 'slippers'];
const BOY_OPTIONS: PersonOptions = { hairStyles: ['short', 'sidepart', 'curly-short', 'mohawk', 'bald'], tops: ['tshirt', 'long-sleeve', 'jacket', 'hoodie'], bottoms: ['pants', 'shorts'], shoes: EVERYDAY_SHOES };
const GIRL_OPTIONS: PersonOptions = {
  hairStyles: ['bob', 'long', 'curly-long', 'braids', 'high-braids', 'ponytail', 'pigtails', 'bun', 'buns', 'floor-length'],
  tops: ['tshirt', 'tank', 'long-top', 'long-sleeve', 'jacket', 'hoodie'],
  bottoms: ['skirt', 'pants', 'shorts', 'long-skirt', 'floor-skirt', 'royal-skirt', 'mini-skirt'], shoes: EVERYDAY_SHOES,
};
export const PERSON_OPTIONS: Record<PersonKind, PersonOptions> = {
  baby: { hairStyles: ['tuft', 'baby-curls', 'bald'], tops: ['onesie', 'tshirt', 'long-sleeve', 'hoodie'], bottoms: ['diaper', 'pants', 'shorts'], shoes: ['booties', 'slippers'] },
  boy: BOY_OPTIONS, man: BOY_OPTIONS, grandpa: BOY_OPTIONS, girl: GIRL_OPTIONS,
  woman: { ...GIRL_OPTIONS, tops: [...GIRL_OPTIONS.tops, 'bra'], shoes: [...EVERYDAY_SHOES, 'heels'] },
  grandma: { ...GIRL_OPTIONS, tops: [...GIRL_OPTIONS.tops, 'bra'], shoes: [...EVERYDAY_SHOES, 'heels'] },
};
export const isFemalePerson = (kind: PersonKind): boolean => ['girl', 'woman', 'grandma'].includes(kind);
export const isOlderPerson = (kind: PersonKind): boolean => kind === 'grandpa' || kind === 'grandma';
export const isAdultPerson = (kind: PersonKind): boolean => ['woman', 'man', 'grandpa', 'grandma'].includes(kind);
export const canHaveBeard = (kind: PersonKind): boolean => kind === 'man' || kind === 'grandpa';
export const wrinkleRange = (kind: PersonKind): readonly [number, number] => isOlderPerson(kind) ? [35, 100] : isAdultPerson(kind) ? [0, 60] : [0, 0];
export function normalizePersonSpec(spec: PersonSpec): PersonSpec {
  const options = PERSON_OPTIONS[spec.kind];
  const [min, max] = wrinkleRange(spec.kind);
  return {
    ...spec,
    hairStyle: options.hairStyles.includes(spec.hairStyle) ? spec.hairStyle : options.hairStyles[0],
    top: options.tops.includes(spec.top) ? spec.top : options.tops[0],
    bottom: options.bottoms.includes(spec.bottom) ? spec.bottom : options.bottoms[0],
    shoes: options.shoes.includes(spec.shoes) ? spec.shoes : options.shoes[0],
    wrinkles: Math.max(min, Math.min(max, spec.wrinkles)),
    facialHair: canHaveBeard(spec.kind) ? spec.facialHair : 'none',
    crown: isFemalePerson(spec.kind) && spec.crown,
    fringe: spec.hairStyle !== 'bald' && spec.kind !== 'baby' && spec.fringe,
  };
}
export function personForKind(kind: PersonKind): PersonSpec {
  return normalizePersonSpec({ ...DEFAULT_PERSON, kind, crown: false, hairStyle: isFemalePerson(kind) ? 'bob' : kind === 'baby' ? 'tuft' : 'short',
    face: kind === 'baby' ? 'chubby' : isOlderPerson(kind) ? 'oval' : 'round',
    hair: isOlderPerson(kind) ? '#b5b4b0' : DEFAULT_PERSON.hair, wrinkles: isOlderPerson(kind) ? 75 : isAdultPerson(kind) ? 12 : 0,
    build: kind === 'baby' ? 'stocky' : 'regular', facialHair: kind === 'grandpa' ? 'mustache' : 'none',
    top: kind === 'baby' ? 'onesie' : 'tshirt', bottom: isFemalePerson(kind) ? 'skirt' : kind === 'baby' ? 'diaper' : 'pants',
    shoes: kind === 'baby' ? 'booties' : 'sneakers',
  });
}
export const FURNITURE_LABELS: Record<FurnitureKind, string> = { chair: 'Židle', table: 'Stůl', wardrobe: 'Skříň', toy: 'Hračka' };
export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function defaultDocument(): SuperboxDocument {
  const library: Design[] = [
    { id: 'princess', name: 'Levandulová princezna', kind: 'person', spec: { ...DEFAULT_PERSON } },
    { id: 'child', name: 'Malý objevitel', kind: 'person', spec: { ...personForKind('boy'), topColor: '#91b5ca', bottomColor: '#d4af62', hairStyle: 'curly-short', accent: '#f8d890' } },
    { id: 'mom', name: 'Žena v zeleném', kind: 'person', spec: { ...personForKind('woman'), hairStyle: 'ponytail', top: 'long-top', topColor: '#b9cbb3', bottomColor: '#749887' } },
    { id: 'dad', name: 'Muž v mikině', kind: 'person', spec: { ...personForKind('man'), top: 'hoodie', topColor: '#d39c84', bottomColor: '#697b8b', accent: '#f5e5cf' } },
    { id: 'girl', name: 'Holčička s drdůlky', kind: 'person', spec: { ...personForKind('girl'), hairStyle: 'buns', topColor: '#dfa5a1', bottomColor: '#a16b83', accent: '#f8d890' } },
    { id: 'baby', name: 'Miminko v capáčkách', kind: 'person', spec: { ...personForKind('baby'), topColor: '#a8c7ba', bottomColor: '#fff1d6', shoeColor: '#a8c7ba' } },
    { id: 'grandpa', name: 'Dědeček s knírem', kind: 'person', spec: { ...personForKind('grandpa'), top: 'jacket', topColor: '#ae9275', bottomColor: '#6c7983' } },
    { id: 'grandma', name: 'Babička s drdolem', kind: 'person', spec: { ...personForKind('grandma'), hairStyle: 'bun', top: 'long-top', bottom: 'long-skirt', shoes: 'slippers', topColor: '#bc9bb9', bottomColor: '#849d9b' } },
    ...(['chair', 'table', 'wardrobe', 'toy'] as FurnitureKind[]).map(kind => ({ id: kind, name: ({ chair: 'Mátová židle', table: 'Kulatý stoleček', wardrobe: 'Skříň na poklady', toy: 'Medvídek' })[kind], kind: 'furniture' as const, spec: { ...DEFAULT_FURNITURE, kind } })),
  ];
  return { version: 2, box: { ...DEFAULT_BOX }, person: { ...DEFAULT_PERSON }, furniture: { ...DEFAULT_FURNITURE }, house: { ...DEFAULT_HOUSE }, library, rewardId: 'princess', fumfiks: 50, placements: [
    { id: 'initial-child', name: 'Malý objevitel', reward: clone(library.find(d => d.id === 'child')) as Reward, x: 29, y: 79, size: 18, flipped: false },
    { id: 'initial-chair', name: 'Mátová židle', reward: clone(library.find(d => d.id === 'chair')) as Reward, x: 70, y: 82, size: 19, flipped: false },
    { id: 'initial-bear', name: 'Medvídek', reward: clone(library.find(d => d.id === 'toy')) as Reward, x: 70, y: 45, size: 15, flipped: false },
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
function validPersonShape(value: unknown): value is PersonSpec {
  return isObject(value) && oneOf(value['kind'], Object.keys(PERSON_OPTIONS))
    && ['skin', 'hair', 'topColor', 'bottomColor', 'shoeColor', 'accent'].every(k => color(value[k]))
    && oneOf(value['hairStyle'], Object.keys(PERSON_HAIR_LABELS))
    && oneOf(value['face'], Object.keys(PERSON_FACE_LABELS)) && oneOf(value['eyes'], Object.keys(PERSON_EYE_LABELS))
    && oneOf(value['build'], Object.keys(PERSON_BUILD_LABELS)) && numberIn(value['wrinkles'], 0, 100)
    && oneOf(value['top'], Object.keys(PERSON_TOP_LABELS)) && oneOf(value['bottom'], Object.keys(PERSON_BOTTOM_LABELS))
    && oneOf(value['shoes'], Object.keys(PERSON_SHOE_LABELS)) && oneOf(value['facialHair'], Object.keys(PERSON_BEARD_LABELS))
    && typeof value['fringe'] === 'boolean' && typeof value['crown'] === 'boolean';
}
export function validSpec(kind: DesignKind, value: unknown): boolean {
  if (!isObject(value)) return false;
  const v = value;
  if (kind === 'person') {
    if (!validPersonShape(value)) return false;
    const normalized = normalizePersonSpec(value);
    return (Object.keys(normalized) as (keyof PersonSpec)[]).every(key => normalized[key] === value[key]);
  }
  if (kind === 'furniture') return oneOf(v['kind'], ['chair', 'table', 'wardrobe', 'toy']) && color(v['color']) && color(v['accent']) && oneOf(v['style'], ['round', 'square']) && oneOf(v['detail'], ['plain', 'stars', 'hearts']) && oneOf(v['toy'], ['bear', 'blocks', 'car']);
  if (kind === 'box') return ['color', 'ribbon', 'patternColor'].every(k => color(v[k])) && oneOf(v['pattern'], ['plain', 'dots', 'stars', 'stripes']) && oneOf(v['inflation'], ['puff', 'spin', 'wobble', 'bounce']) && oneOf(v['burst'], ['confetti', 'bubbles', 'stars', 'none']) && numberIn(v['delay'], 0, 3000) && numberIn(v['duration'], 600, 5000) && numberIn(v['intensity'], .3, 1.5) && numberIn(v['particles'], 12, 80) && Number.isInteger(v['particles']);
  return oneOf(v['kind'], ['cottage', 'townhouse', 'castle']) && ['wall', 'roof', 'floor'].every(k => color(v[k])) && oneOf(v['wallpaper'], ['plain', 'dots', 'stripes']) && numberIn(v['floors'], 1, 3) && Number.isInteger(v['floors']) && numberIn(v['rooms'], 1, 3) && Number.isInteger(v['rooms']) && numberIn(v['cost'], 1, 1000) && Number.isInteger(v['cost']);
}
export function parseDocument(json: string): SuperboxDocument {
  const fail = (): never => { throw new Error('Soubor neobsahuje platný návrh Superbox labu (verze 1 nebo 2).'); };
  if (json.length > 600_000) return fail();
  let value: unknown;
  try { value = JSON.parse(json); } catch { return fail(); }
  if (!isObject(value) || (value['version'] !== 1 && value['version'] !== 2)) return fail();
  if (value['version'] === 1) {
    const upgradeReward = (reward: unknown): void => {
      if (isObject(reward) && reward['kind'] === 'person') reward['spec'] = upgradeLegacyPerson(reward['spec']);
    };
    value['person'] = upgradeLegacyPerson(value['person']);
    if (Array.isArray(value['library'])) value['library'].forEach(upgradeReward);
    if (Array.isArray(value['placements'])) value['placements'].forEach(p => { if (isObject(p)) upgradeReward(p['reward']); });
    value['version'] = 2;
  }
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

// Migrate the complete workshop, including independent copies placed in houses.
// Validate the old vocabulary first so malformed values are never hidden by defaults.
function upgradeLegacyPerson(value: unknown): unknown {
  if (!isObject(value) || !oneOf(value['kind'], ['child', 'girl', 'princess', 'dad', 'mom'])
    || !['skin', 'hair', 'clothing', 'accent'].every(k => color(value[k]))
    || !oneOf(value['hairStyle'], ['short', 'bob', 'long', 'buns'])
    || !oneOf(value['outfit'], ['casual', 'dress', 'overalls', 'royal'])) return null;
  const kinds: Record<string, PersonKind> = { child: 'boy', girl: 'girl', princess: 'girl', dad: 'man', mom: 'woman' };
  const kind = kinds[value['kind'] as string], female = isFemalePerson(kind);
  const dress = female && (value['outfit'] === 'dress' || value['outfit'] === 'royal');
  const royal = female && (value['kind'] === 'princess' || value['outfit'] === 'royal');
  return normalizePersonSpec({ ...personForKind(kind), skin: value['skin'] as string, hair: value['hair'] as string,
    hairStyle: value['hairStyle'] as PersonSpec['hairStyle'], topColor: value['clothing'] as string,
    bottomColor: (dress ? value['clothing'] : value['accent']) as string, accent: value['accent'] as string,
    top: female ? 'tank' : 'tshirt', bottom: royal ? 'royal-skirt' : female ? 'skirt' : 'pants', crown: royal,
    facialHair: kind === 'man' ? 'mustache' : 'none',
  });
}
