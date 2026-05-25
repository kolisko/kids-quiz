import { PracticeAnswerKind, QuestionStats } from './models';

export function nextScore(current: number, result: PracticeAnswerKind): number {
  return result === 'correct' ? current + 1 : current - 1;
}

export function adaptiveWeight(stats: QuestionStats | undefined, sessionMistakeWeight = 0): number {
  const historicalMistakes = (stats?.wrong ?? 0) + (stats?.timeout ?? 0);
  const historicalSuccesses = stats?.correct ?? 0;
  const historyWeight = Math.max(0, historicalMistakes * 2 - historicalSuccesses);
  return 1 + historyWeight + Math.max(0, sessionMistakeWeight);
}

export function pickWeightedIndex<T extends { key: string }>(
  items: T[],
  stats: Record<string, QuestionStats>,
  sessionWeights: Record<string, number>,
): number {
  if (items.length <= 1) return 0;
  const weighted: number[] = [];
  items.forEach((item, index) => {
    const weight = adaptiveWeight(stats[item.key], sessionWeights[item.key] ?? 0);
    for (let count = 0; count < weight; count += 1) weighted.push(index);
  });
  return weighted[Math.floor(Math.random() * weighted.length)] ?? 0;
}

export function normalizePracticeWord(value: string): string {
  return value.trim().toLocaleLowerCase();
}
