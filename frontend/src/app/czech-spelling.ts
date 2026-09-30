export interface CzechSpellingQuestion {
  key: string;
  word: string;
  blankIndex: number;
  options: string[];
}

export interface CzechSpellingStatsSnapshot {
  statsByKey: Record<string, { correct: number; wrong: number }>;
}

export function czechSpellingWordsError(message: string): string {
  if (message.includes('empty_czech_spelling_words')) return 'Zadej alespoň jedno slovo.';
  if (message.includes('missing_czech_spelling_letters')) return 'Každé slovo musí obsahovat alespoň jedno ú, ů, i nebo y. Dlouhá í a ý se v tomto testu nedoplňují.';
  if (message.includes('too_many_czech_spelling_words')) return 'Seznam může obsahovat nejvýše 500 slov.';
  if (message.includes('invalid_czech_spelling_words')) return 'Zadej jednotlivá slova oddělená čárkami, bez mezer uvnitř slova, číslic nebo jiných znaků (nejvýše 40 písmen na slovo).';
  return 'Slova se nepodařilo uložit. Zkus to prosím znovu.';
}

export function czechSpellingPrompt(question: CzechSpellingQuestion): string {
  return question.word.slice(0, question.blankIndex) + '_' + question.word.slice(question.blankIndex + 1);
}

export function czechSpellingCandidates(
  questions: CzechSpellingQuestion[],
  target: number,
  weight: (key: string) => number,
) {
  if (questions.length === 0) return [];
  // Targets up to the pool size use unique questions. Larger targets can use another
  // copy of the pool so the configured goal is never silently reduced.
  return Array.from({ length: Math.ceil(target / questions.length) }, (_, round) =>
    questions.map((question, index) => ({
      key: `${question.key}#${round}`,
      value: index,
      weight: weight(question.key),
      group: question.options.join('/'),
      order: round,
    })),
  ).flat();
}

export function czechSpellingResults(results: { key: string; hadMistake: boolean }[]) {
  const byWord = new Map<string, boolean>();
  for (const result of results) {
    const key = result.key.split('#')[0];
    byWord.set(key, (byWord.get(key) ?? true) && !result.hadMistake);
  }
  return Array.from(byWord, ([key, correct]) => ({ key, correct }));
}
