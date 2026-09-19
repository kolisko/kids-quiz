import type { PersonSpec } from './superbox.model';

export const FACE_PATHS: Record<PersonSpec['face'], string> = {
  round: 'M67 56 Q65 29 100 29 Q135 29 133 56 L132 72 Q127 96 100 97 Q73 96 68 72Z',
  oval: 'M72 53 Q71 25 100 25 Q129 25 128 53 L128 72 Q125 99 100 102 Q75 99 72 72Z',
  chubby: 'M68 54 Q66 29 100 29 Q134 29 132 54 Q145 68 136 83 Q128 101 100 97 Q72 101 64 83 Q55 68 68 54Z',
  slim: 'M75 54 Q72 27 100 27 Q128 27 125 54 L124 72 Q120 93 100 101 Q80 93 76 72Z',
  gaunt: 'M74 53 Q73 27 100 27 Q127 27 126 53 L124 67 L116 79 L113 89 L100 102 L87 89 L84 79 L76 67Z',
};
export const EYE_PATHS: Record<PersonSpec['eyes'], string> = {
  round: 'M-6 0 A6 6 0 1 0 6 0 A6 6 0 1 0 -6 0Z',
  oval: 'M-4.5 0 A4.5 6.5 0 1 0 4.5 0 A4.5 6.5 0 1 0 -4.5 0Z',
  almond: 'M-8 0 Q0 -8 8 0 Q0 7 -8 0Z',
  narrow: 'M-8 0 Q0 -4 8 0 Q0 4 -8 0Z',
  sleepy: 'M-7 -1 Q0 -1 7 -1 Q5 7 0 6 Q-5 7 -7 -1Z',
};

/** All ages stand on the same baseline and fit in the shared reward footprint. */
export function personGeometry(person: PersonSpec) {
  const baby = person.kind === 'baby', child = person.kind === 'girl' || person.kind === 'boy';
  const older = person.kind === 'grandpa' || person.kind === 'grandma';
  const female = ['girl', 'woman', 'grandma'].includes(person.kind);
  const headY = baby ? 111 : child ? 67 : older ? 66 : 58;
  const headScale = baby ? .96 : child ? .94 : .80;
  const earOffset = person.face === 'gaunt' || person.face === 'slim' ? 29 : person.face === 'oval' ? 32 : 34;
  const shoulderY = baby ? 144 : child ? 102 : older ? 101 : 93;
  const waistY = baby ? 163 : child ? 137 : older ? 137 : 130;
  const hipY = baby ? 167 : child ? 145 : older ? 145 : 139;
  const shoulder = baby ? 17 : child ? 22 : female ? 21 : 25;
  const waist = female ? 17 : baby ? 20 : 22;
  const hip = female ? 23 : baby ? 20 : 23;
  const build = { slim: .82, regular: 1, stocky: 1.17 }[person.build];
  const legGap = baby ? 12 : female ? 12 : 14;
  const legWidth = baby ? 10 : child ? 13 : 12;
  const handY = hipY + (baby ? 2 : 0);
  const arm = (side: number) => `M${100 + side * (shoulder - 1)} ${shoulderY + 5} Q${100 + side * (shoulder + 13)} ${waistY - 7} ${100 + side * (shoulder + 12)} ${handY}`;
  const sleeve = (side: number) => `M${100 + side * (shoulder - 1)} ${shoulderY + 5} L${100 + side * (shoulder + 6)} ${shoulderY + 18}`;
  const topEnd = person.top === 'bra' ? shoulderY + 20 : person.top === 'tank' || person.top === 'long-top' ? waistY : person.top === 'onesie' ? hipY + 1 : waistY + 7;
  const torso = (end: number) => `M${100 - shoulder} ${shoulderY + 2} Q100 ${shoulderY - (older ? 9 : 5)} ${100 + shoulder} ${shoulderY + 2} Q${100 + waist} ${Math.min(waistY - 5, end - 5)} ${100 + waist + 2} ${end} Q100 ${end + 6} ${100 - waist - 2} ${end} Q${100 - waist} ${Math.min(waistY - 5, end - 5)} ${100 - shoulder} ${shoulderY + 2}Z`;
  const trunk = torso(topEnd), body = torso(hipY);
  const pantsEnd = person.bottom === 'shorts' ? hipY + (183 - hipY) * .40 : 179;
  const pants = `M${100 - hip} ${waistY - 1} H${100 + hip} L${100 + legGap + legWidth / 2} ${pantsEnd} H${100 + legGap - legWidth / 2} L100 ${hipY + 5} L${100 - legGap + legWidth / 2} ${pantsEnd} H${100 - legGap - legWidth / 2}Z`;
  const skirtRatio = ({ skirt: .47, 'long-skirt': .78, 'floor-skirt': 1, 'royal-skirt': .96, 'mini-skirt': .25 } as Record<string, number>)[person.bottom] ?? .47;
  const skirtY = hipY + (184 - hipY) * skirtRatio;
  const skirtWidth = person.bottom === 'royal-skirt' ? 43 : person.bottom === 'mini-skirt' ? 28 : 34;
  const skirt = `M${100 - waist} ${waistY} H${100 + waist} Q${100 + skirtWidth - 8} ${skirtY - 15} ${100 + skirtWidth} ${skirtY} Q100 ${skirtY + 6} ${100 - skirtWidth} ${skirtY} Q${100 - skirtWidth + 8} ${skirtY - 15} ${100 - waist} ${waistY}Z`;
  const hairEnd = person.hairStyle === 'floor-length' ? 62 + (183 - headY) / headScale : person.hairStyle === 'bob' ? 97 : 137;
  return {
    baby, child, older, female, headY, headScale, earOffset, shoulderY, waistY, hipY, shoulder, waist, hip, legGap, legWidth, handY, skirtY, skirtWidth, hairEnd,
    headTransform: `translate(100 ${headY}) scale(${headScale}) translate(-100 -62)`,
    bodyTransform: `translate(100 0) scale(${build} 1) translate(-100 0)`,
    facePath: FACE_PATHS[person.face], eyePath: EYE_PATHS[person.eyes], trunk, body, pants, skirt,
    arms: arm(-1) + ' ' + arm(1), sleeves: sleeve(-1) + ' ' + sleeve(1),
    legs: `M${100 - legGap} ${hipY} V179 M${100 + legGap} ${hipY} V179`,
    longHair: `M64 54 Q56 22 100 22 Q144 22 136 54 L147 ${hairEnd - 6} Q128 ${hairEnd + 7} 111 ${hairEnd - 1} H89 Q70 ${hairEnd + 7} 53 ${hairEnd - 6}Z`,
    hairLines: `M67 63 Q63 ${hairEnd - 25} 65 ${hairEnd - 8} M133 63 Q138 ${hairEnd - 25} 135 ${hairEnd - 8}`,
    wrinkleOpacity: person.wrinkles / 100 * .75,
  };
}
