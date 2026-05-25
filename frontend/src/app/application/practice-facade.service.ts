import { Injectable } from '@angular/core';
import {
  ActivityKind,
  FlipcardWord,
  PracticeAnswerKind,
  PracticeDeck,
  PracticeDirection,
  Question,
  SpellingWord,
} from '../domain/models';
import { nextScore, pickWeightedIndex } from '../domain/practice-rules';
import { ApiClient } from '../infrastructure/api-client.service';

export interface PracticeItem {
  key: string;
  prompt: string;
  answer: string;
  imageUrl: string | null;
  audioUrl: string | null;
  visualLabel: string;
  direction: PracticeDirection;
  source: Question | SpellingWord | FlipcardWord;
}

@Injectable({ providedIn: 'root' })
export class PracticeFacade {
  private sessionWeights: Record<string, number> = {};

  constructor(private readonly api: ApiClient) {}

  load(activityId: string, mode: string | null): Promise<PracticeDeck> {
    this.sessionWeights = {};
    return this.api.deck(activityId, mode, 10);
  }

  pick(deck: PracticeDeck, direction: PracticeDirection = 'product_to_factors'): PracticeItem | null {
    if (deck.activity.kind === 'multiplication') return this.pickQuestion(deck, direction);
    if (deck.activity.kind === 'spelling') return this.pickSpelling(deck);
    return this.pickFlipcard(deck);
  }

  async answer(deck: PracticeDeck, item: PracticeItem, result: PracticeAnswerKind, score: number): Promise<number> {
    if (result !== 'correct') {
      this.sessionWeights[item.key] = (this.sessionWeights[item.key] ?? 0) + 2;
    } else {
      this.sessionWeights[item.key] = Math.max(0, (this.sessionWeights[item.key] ?? 0) - 1);
    }
    void Promise.race([
      this.api.answer(deck.activity.id, item.key, result, item.direction),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1600)),
    ]).catch(() => null);
    return nextScore(score, result);
  }

  private pickQuestion(deck: PracticeDeck, direction: PracticeDirection): PracticeItem | null {
    const questions = deck.questions.map((question) => ({ key: String(question.id), question }));
    if (questions.length === 0) return null;
    const entry = questions[pickWeightedIndex(questions, deck.questionStats, this.sessionWeights)];
    const question = entry.question;
    const prompt = direction === 'factors_to_product'
      ? question.answers[Math.floor(Math.random() * question.answers.length)] ?? question.answers[0] ?? question.q
      : question.q;
    const answer = direction === 'factors_to_product' ? question.q : question.answers.join(', ');
    return { key: String(question.id), prompt, answer, imageUrl: null, audioUrl: null, visualLabel: prompt.slice(0, 3), direction, source: question };
  }

  private pickSpelling(deck: PracticeDeck): PracticeItem | null {
    const words = deck.spellingWords.map((word) => ({ key: word.normalized, word }));
    if (words.length === 0) return null;
    const entry = words[pickWeightedIndex(words, deck.wordStats, this.sessionWeights)];
    return {
      key: entry.word.normalized,
      prompt: 'Poslechni si slovo',
      answer: entry.word.text,
      imageUrl: null,
      audioUrl: null,
      visualLabel: entry.word.text.slice(0, 1).toLocaleUpperCase(),
      direction: 'product_to_factors',
      source: entry.word,
    };
  }

  private pickFlipcard(deck: PracticeDeck): PracticeItem | null {
    const words = deck.flipcardWords.map((word) => ({ key: word.normalized, word }));
    if (words.length === 0) return null;
    const entry = words[pickWeightedIndex(words, deck.wordStats, this.sessionWeights)];
    const asset = (deck.flipcardAssets ?? []).find((candidate) => candidate.normalized === entry.word.normalized);
    return {
      key: entry.word.normalized,
      prompt: entry.word.text,
      answer: entry.word.text,
      imageUrl: asset?.imageUrl ?? null,
      audioUrl: asset?.audioUrl ?? null,
      visualLabel: entry.word.text.slice(0, 1).toLocaleUpperCase(),
      direction: 'product_to_factors',
      source: entry.word,
    };
  }
}
