import type { FumfikAppearance } from '../fumfik/fumfik.component';

export interface TimedQuestion { key: string; text: string; answer: number; }
export interface TimedLevel { level: number; seconds: number; record: number; questions: TimedQuestion[]; }
export interface TimedSummary { levels: TimedLevel[]; totalRecord: number; superboxCount: number; }
export interface TimedRun { id: string; startsAt: number; serverNow: number; summary: TimedSummary; }
export interface TimedAttempt { key: string; correct: boolean; elapsedMs: number; }
export interface TimedLevelResult {
  level: number; seconds: number; correct: number; wrong: number; previousRecord: number; record: number;
  trophy: (FumfikAppearance & { animalKey: string; wonAt: string }) | null;
}
export interface TimedResult {
  runId: string; levels: TimedLevelResult[]; total: number; previousTotalRecord: number;
  totalRecord: number; superboxAwarded: boolean; superboxCount: number;
}

export const LEVEL_LABELS = ['Do 10', 'Od 10 do 20', 'Přes desítku'];

export function formatTime(seconds: number): string {
  return `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`;
}

// This game is time-limited, not a finite question set. Keep its rules out of the practice engine.
export class TimedArithmeticEngine {
  readonly attempts: TimedAttempt[][] = [[], [], []];
  levelIndex = -1;
  question: TimedQuestion | null = null;
  answerVisible = false;
  elapsedMs = -1;
  finished = false;
  private queue: TimedQuestion[] = [];
  private lastKey: string | null = null;

  readonly levels: TimedLevel[];
  private readonly random: () => number;
  constructor(levels: TimedLevel[], random: () => number = Math.random) {
    this.levels = levels;
    this.random = random;
  }

  tick(elapsedMs: number): void {
    this.elapsedMs = Math.max(this.elapsedMs, Math.floor(elapsedMs));
    if (this.elapsedMs < 0 || this.finished) return;
    let end = 0;
    const index = this.levels.findIndex(level => {
      end += level.seconds * 1000;
      return this.elapsedMs < end;
    });
    if (index < 0) {
      this.finished = true;
      this.question = null;
      this.answerVisible = false;
    } else if (index !== this.levelIndex) {
      this.levelIndex = index;
      this.queue = [];
      this.lastKey = null;
      this.next();
    }
  }

  reveal(elapsedMs: number): void {
    const question = this.question;
    this.tick(elapsedMs);
    if (!this.finished && question === this.question && question) this.answerVisible = true;
  }

  record(correct: boolean, elapsedMs: number): void {
    const question = this.question;
    this.tick(elapsedMs);
    if (!question || question !== this.question || !this.answerVisible || this.finished) return;
    const attempts = this.attempts[this.levelIndex];
    if (attempts.at(-1)?.elapsedMs === this.elapsedMs) return;
    attempts.push({ key: question.key, correct, elapsedMs: this.elapsedMs });
    this.next();
  }

  score(index: number): number { return this.attempts[index]?.filter(attempt => attempt.correct).length ?? 0; }
  get total(): number { return this.attempts.reduce((sum, _, index) => sum + this.score(index), 0); }
  get secondsLeft(): number {
    if (this.finished || this.levelIndex < 0) return 0;
    const end = this.levels.slice(0, this.levelIndex + 1).reduce((sum, level) => sum + level.seconds * 1000, 0);
    return Math.max(0, Math.ceil((end - this.elapsedMs) / 1000));
  }

  private next(): void {
    if (!this.queue.length) {
      const pool = this.levels[this.levelIndex].questions;
      const addition = this.shuffle(pool.filter(q => q.key.startsWith('add:')));
      const subtraction = this.shuffle(pool.filter(q => q.key.startsWith('sub:')));
      // Balanced operation pairs, with random order and unique examples before refilling each pool.
      const count = Math.max(addition.length, subtraction.length);
      for (let index = 0; index < count; index += 1) {
        const pair = [addition[index % addition.length], subtraction[index % subtraction.length]];
        if (this.random() < 0.5) pair.reverse();
        this.queue.push(...pair);
      }
    }
    const index = this.queue.findIndex(question => question.key !== this.lastKey);
    this.question = this.queue.splice(Math.max(0, index), 1)[0];
    this.lastKey = this.question.key;
    this.answerVisible = false;
  }

  private shuffle<T>(items: T[]): T[] {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const other = Math.floor(this.random() * (index + 1));
      [items[index], items[other]] = [items[other], items[index]];
    }
    return items;
  }
}
