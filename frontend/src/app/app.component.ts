import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

const secondsStorageKey = 'kids-quiz.seconds-limit';
const targetStorageKey = 'kids-quiz.target-score';

type Screen = 'login' | 'start' | 'play' | 'settings' | 'finished';

interface GameSettings {
  secondsLimit: number;
  targetScore: number;
}

interface Question {
  q: string;
  a: string;
}

interface QuizTest {
  id: number;
  name: string;
  questionCount: number;
}

interface QuestionStats {
  correct: number;
  wrong: number;
  timeout: number;
}

interface QuestionStatsSnapshot {
  statsByKey: Record<string, QuestionStats>;
}

interface AuthStatusResponse {
  authenticated: boolean;
}

interface AnswerResultResponse {
  key: string;
  stats: QuestionStats;
}

interface AnimalSurprise {
  imagePath: string;
  animationClass: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit, OnDestroy {
  screen: Screen = 'login';
  loading = true;
  authLoading = false;
  savingQuestions = false;
  authError: string | null = null;
  jsonError: string | null = null;
  password = '';

  settings: GameSettings = { secondsLimit: 10, targetScore: 10 };
  tests: QuizTest[] = [];
  selectedTest: QuizTest | null = null;
  questions: Question[] = [];
  serverStats: Record<string, QuestionStats> = {};
  questionJson = '';
  score = 0;
  currentIndex: number | null = null;
  answerVisible = false;
  timedOut = false;
  secondsLeft = this.settings.secondsLimit;
  flash: string | null = null;
  surprise = surprises[0];

  private readonly mistakeWeights = new Map<number, number>();
  private timerId: number | null = null;
  private flashTimerId: number | null = null;

  constructor(private readonly changeDetector: ChangeDetectorRef) {}

  get currentQuestion(): Question | null {
    return this.currentIndex === null ? null : this.questions[this.currentIndex] ?? null;
  }

  get questionCountText(): string {
    const count = this.questions.length;
    if (count === 1) return '1 otazka';
    if (count > 1 && count < 5) return `${count} otazky`;
    return `${count} otazek`;
  }

  async ngOnInit(): Promise<void> {
    await this.loadGameData();
  }

  ngOnDestroy(): void {
    this.clearTimer();
    this.clearFlashTimer();
  }

  async submitLogin(): Promise<void> {
    if (!this.password.trim()) return;
    this.authLoading = true;
    this.authError = null;
    try {
      const response = await this.apiPost<AuthStatusResponse>('auth/login', { password: this.password });
      if (!response.authenticated) {
        this.authError = 'Heslo nesedi.';
        return;
      }
      this.password = '';
      await this.loadGameData();
    } catch {
      this.authError = 'Heslo nesedi.';
    } finally {
      this.authLoading = false;
      this.render();
    }
  }

  restartGame(): void {
    if (this.questions.length === 0) {
      this.screen = 'settings';
      return;
    }
    this.score = 0;
    this.mistakeWeights.clear();
    this.screen = 'play';
    this.pickQuestion();
  }

  async startTest(test: QuizTest): Promise<void> {
    this.selectedTest = test;
    this.loading = true;
    try {
      const [stats, questions] = await Promise.all([
        this.apiGet<QuestionStatsSnapshot>(`tests/${test.id}/stats`),
        this.apiGet<Question[]>(`tests/${test.id}/questions`),
      ]);
      this.serverStats = stats.statsByKey ?? {};
      this.questions = questions;
      this.questionJson = JSON.stringify(questions, null, 2);
      this.jsonError = null;
      this.restartGame();
    } catch {
      this.screen = 'login';
    } finally {
      this.loading = false;
      this.render();
    }
  }

  showAnswer(): void {
    this.answerVisible = true;
    this.clearTimer();
  }

  markWrong(): void {
    const index = this.currentIndex;
    if (index === null) return;
    this.score -= 1;
    this.mistakeWeights.set(index, (this.mistakeWeights.get(index) ?? 0) + 1);
    void this.recordAnswer(index, false, false);
    this.showPenalty();
    this.pickQuestion();
  }

  markCorrect(): void {
    const index = this.currentIndex;
    if (index === null) return;
    const nextScore = this.score + 1;
    this.score = nextScore;
    this.mistakeWeights.set(index, Math.max(0, (this.mistakeWeights.get(index) ?? 0) - 1));
    void this.recordAnswer(index, true, false);
    if (this.finishIfNeeded(nextScore)) return;
    this.pickQuestion();
  }

  nextAfterTimeout(): void {
    this.pickQuestion();
  }

  async saveSettingsAndQuestions(): Promise<void> {
    if (!this.selectedTest) {
      this.jsonError = 'Nejdřív vyber test.';
      return;
    }
    const parsed = this.parseQuestions(this.questionJson);
    this.jsonError = parsed.error;
    if (parsed.error) return;

    this.savingQuestions = true;
    try {
      await this.apiPost<{ ok: boolean }>(`tests/${this.selectedTest.id}/questions`, parsed.normalizedJson);
      this.questions = parsed.questions;
      this.questionJson = parsed.normalizedJson;
      this.updateSelectedTestQuestionCount(parsed.questions.length);
      this.saveSettings();
      await this.loadServerStats();
      this.restartGame();
    } catch {
      this.jsonError = 'Otazky se nepodarilo ulozit na server.';
    } finally {
      this.savingQuestions = false;
      this.render();
    }
  }

  private async loadGameData(): Promise<void> {
    this.loading = true;
    this.loadSettings();
    try {
      const tests = await this.apiGet<QuizTest[]>('tests');
      this.tests = tests;
      this.selectedTest = this.selectedTest
        ? tests.find((test) => test.id === this.selectedTest?.id) ?? null
        : null;
      this.serverStats = {};
      this.questions = [];
      this.questionJson = '';
      this.jsonError = null;
      this.screen = tests.length > 0 ? 'start' : 'settings';
    } catch {
      this.screen = 'login';
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private loadSettings(): void {
    const seconds = Number.parseInt(localStorage.getItem(secondsStorageKey) ?? '', 10);
    const target = Number.parseInt(localStorage.getItem(targetStorageKey) ?? '', 10);
    this.settings = {
      secondsLimit: Number.isFinite(seconds) ? Math.max(1, seconds) : 10,
      targetScore: Number.isFinite(target) ? Math.max(1, target) : 10,
    };
    this.secondsLeft = this.settings.secondsLimit;
  }

  private saveSettings(): void {
    this.settings = {
      secondsLimit: Math.max(1, Math.floor(Number(this.settings.secondsLimit) || 10)),
      targetScore: Math.max(1, Math.floor(Number(this.settings.targetScore) || 10)),
    };
    localStorage.setItem(secondsStorageKey, `${this.settings.secondsLimit}`);
    localStorage.setItem(targetStorageKey, `${this.settings.targetScore}`);
  }

  private async loadServerStats(): Promise<void> {
    if (!this.selectedTest) {
      this.serverStats = {};
      return;
    }
    const stats = await this.apiGet<QuestionStatsSnapshot>(`tests/${this.selectedTest.id}/stats`);
    this.serverStats = stats.statsByKey ?? {};
    this.render();
  }

  private pickQuestion(): void {
    this.clearTimer();
    if (this.questions.length === 0) {
      this.currentIndex = null;
      this.screen = 'settings';
      return;
    }

    const weightedIndices: number[] = [];
    for (let index = 0; index < this.questions.length; index += 1) {
      const question = this.questions[index];
      const stats = this.serverStats[questionKey(question.q, question.a)];
      const mistakes = stats ? stats.wrong + stats.timeout : 0;
      const longTermDifficulty = stats ? Math.max(0, mistakes * 2 - stats.correct) : 0;
      const sessionDifficulty = this.mistakeWeights.get(index) ?? 0;
      const weight = 1 + longTermDifficulty * 2 + sessionDifficulty * 3;
      for (let copy = 0; copy < weight; copy += 1) {
        weightedIndices.push(index);
      }
    }

    this.currentIndex = weightedIndices[Math.floor(Math.random() * weightedIndices.length)] ?? 0;
    this.answerVisible = false;
    this.timedOut = false;
    this.secondsLeft = this.settings.secondsLimit;
    this.startTimer();
  }

  private startTimer(): void {
    this.clearTimer();
    this.timerId = window.setInterval(() => {
      if (this.screen !== 'play' || this.answerVisible || this.currentIndex === null) {
        this.clearTimer();
        return;
      }
      this.secondsLeft = Math.max(0, this.secondsLeft - 1);
      if (this.secondsLeft === 0) {
        this.handleTimeout();
      }
      this.render();
    }, 1000);
  }

  private handleTimeout(): void {
    const index = this.currentIndex;
    if (index === null || this.answerVisible) return;
    this.clearTimer();
    this.timedOut = true;
    this.answerVisible = true;
    this.score -= 1;
    this.mistakeWeights.set(index, (this.mistakeWeights.get(index) ?? 0) + 1);
    void this.recordAnswer(index, false, true);
    this.showPenalty();
    this.render();
  }

  private finishIfNeeded(nextScore: number): boolean {
    if (nextScore < this.settings.targetScore) return false;
    this.clearTimer();
    this.surprise = surprises[Math.floor(Math.random() * surprises.length)] ?? surprises[0];
    this.screen = 'finished';
    return true;
  }

  private async recordAnswer(index: number, correct: boolean, timedOut: boolean): Promise<void> {
    const question = this.questions[index];
    const test = this.selectedTest;
    if (!question || !test) return;
    const response = await this.apiPost<AnswerResultResponse>(`tests/${test.id}/stats/answer`, {
      q: question.q,
      a: question.a,
      correct,
      timedOut,
    });
    this.serverStats = {
      ...this.serverStats,
      [response.key]: response.stats,
    };
    this.render();
  }

  private updateSelectedTestQuestionCount(questionCount: number): void {
    const selected = this.selectedTest;
    if (!selected) return;
    const updated = { ...selected, questionCount };
    this.selectedTest = updated;
    this.tests = this.tests.map((test) => test.id === updated.id ? updated : test);
  }

  private showPenalty(): void {
    this.flash = '-1';
    this.clearFlashTimer();
    this.flashTimerId = window.setTimeout(() => {
      this.flash = null;
      this.flashTimerId = null;
      this.render();
    }, 900);
    this.render();
  }

  private parseQuestions(source: string): { questions: Question[]; normalizedJson: string; error: string | null } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch {
      return { questions: [], normalizedJson: source, error: 'JSON musi byt seznam objektu s atributy q a a.' };
    }
    if (!Array.isArray(parsed)) {
      return { questions: [], normalizedJson: source, error: 'JSON musi byt seznam objektu.' };
    }
    const questions = parsed.map((item) => {
      const question = item as Partial<Question> | null;
      return {
        q: typeof question?.q === 'string' ? question.q.trim() : '',
        a: typeof question?.a === 'string' ? question.a.trim() : '',
      };
    });
    const invalidIndex = questions.findIndex((question) => !question.q || !question.a);
    if (invalidIndex >= 0) {
      return {
        questions: [],
        normalizedJson: source,
        error: `Otazka cislo ${invalidIndex + 1} nema vyplnene q nebo a.`,
      };
    }
    return {
      questions,
      normalizedJson: JSON.stringify(questions, null, 2),
      error: null,
    };
  }

  private async apiGet<T>(path: string, redirectOnUnauthorized = true): Promise<T> {
    const separator = path.includes('?') ? '&' : '?';
    const response = await fetch(`/api/${path}${separator}_=${Date.now()}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    return this.readApiResponse<T>(response, redirectOnUnauthorized);
  }

  private async apiPost<T>(path: string, body: unknown, redirectOnUnauthorized = true): Promise<T> {
    const headers = typeof body === 'string'
      ? { 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' };
    const response = await fetch(`/api/${path}`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
    return this.readApiResponse<T>(response, redirectOnUnauthorized);
  }

  private async readApiResponse<T>(response: Response, redirectOnUnauthorized: boolean): Promise<T> {
    if (response.status === 401 && redirectOnUnauthorized) {
      this.screen = 'login';
    }
    if (!response.ok) {
      throw new Error(`API ${response.status}`);
    }
    return response.json() as Promise<T>;
  }

  private clearTimer(): void {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private clearFlashTimer(): void {
    if (this.flashTimerId !== null) {
      window.clearTimeout(this.flashTimerId);
      this.flashTimerId = null;
    }
  }

  private render(): void {
    this.changeDetector.detectChanges();
  }
}

function questionKey(q: string, a: string): string {
  return `${q.trim()}\n---answer---\n${a.trim()}`;
}

const surprises: AnimalSurprise[] = Array.from({ length: 40 }, (_, index) => ({
  imagePath: `/assets/animals/animal-${String(index + 1).padStart(2, '0')}.svg`,
  animationClass: ['pop', 'floaty', 'wiggle', 'spinny', 'bounce'][index % 5],
}));
