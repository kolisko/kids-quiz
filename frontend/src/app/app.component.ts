import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ArrowLeft, ListRestart, LucideAngularModule, Settings } from 'lucide-angular';

const secondsStorageKey = 'kids-quiz.seconds-limit';
const targetStorageKey = 'kids-quiz.target-score';

type Screen = 'login' | 'start' | 'play' | 'settings' | 'finished';

interface GameSettings {
  secondsLimit: number;
  targetScore: number;
}

interface Question {
  id: number;
  q: string;
  answers: string[];
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
  statsByQuestionId: Record<string, QuestionStats>;
}

interface AuthStatusResponse {
  authenticated: boolean;
}

interface AnswerResultResponse {
  questionId: number;
  stats: QuestionStats;
}

interface AnimalSurprise {
  imagePath: string;
  animationClass: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit, OnDestroy {
  readonly backIcon = ArrowLeft;
  readonly settingsIcon = Settings;
  readonly newTestIcon = ListRestart;

  screen: Screen = 'login';
  loading = true;
  authLoading = false;
  authError: string | null = null;
  settingsSaved = false;
  password = '';

  settings: GameSettings = { secondsLimit: 10, targetScore: 10 };
  tests: QuizTest[] = [];
  selectedTest: QuizTest | null = null;
  questions: Question[] = [];
  serverStats: Record<string, QuestionStats> = {};
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

  get currentAnswerText(): string {
    return this.currentQuestion?.answers.join(', ') ?? '';
  }

  get currentAnswerHint(): string | null {
    const count = this.currentQuestion?.answers.length ?? 0;
    return count > 1 ? answerCountLabel(count) : null;
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
        this.authError = 'Heslo nesedí.';
        return;
      }
      this.password = '';
      await this.loadGameData();
    } catch {
      this.authError = 'Heslo nesedí.';
    } finally {
      this.authLoading = false;
      this.render();
    }
  }

  async startTest(test: QuizTest): Promise<void> {
    this.selectedTest = test;
    this.loading = true;
    this.resetRoundState();
    try {
      const [stats, questions] = await Promise.all([
        this.apiGet<QuestionStatsSnapshot>(`tests/${test.id}/stats`),
        this.apiGet<Question[]>(`tests/${test.id}/questions`),
      ]);
      this.serverStats = stats.statsByQuestionId ?? {};
      this.questions = questions;
      this.score = 0;
      this.mistakeWeights.clear();
      this.screen = 'play';
      this.pickQuestion();
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

  openSettings(): void {
    this.clearTimer();
    this.settingsSaved = false;
    this.screen = 'settings';
  }

  saveSettingsOnly(): void {
    this.saveSettings();
    this.settingsSaved = true;
    this.render();
  }

  returnToTestSelection(): void {
    this.clearTimer();
    this.clearFlashTimer();
    this.resetRoundState();
    this.selectedTest = null;
    this.questions = [];
    this.serverStats = {};
    this.screen = this.tests.length > 0 ? 'start' : 'settings';
    this.render();
  }

  private async loadGameData(): Promise<void> {
    this.loading = true;
    this.loadSettings();
    try {
      const auth = await this.apiGet<AuthStatusResponse>('auth/status');
      if (!auth.authenticated) {
        this.tests = [];
        this.selectedTest = null;
        this.questions = [];
        this.serverStats = {};
        this.screen = 'login';
        return;
      }
      this.tests = await this.apiGet<QuizTest[]>('tests');
      this.selectedTest = null;
      this.questions = [];
      this.serverStats = {};
      this.screen = this.tests.length > 0 ? 'start' : 'settings';
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
    this.secondsLeft = this.settings.secondsLimit;
  }

  private pickQuestion(): void {
    this.clearTimer();
    if (this.questions.length === 0) {
      this.currentIndex = null;
      this.screen = 'start';
      return;
    }

    const weightedIndices: number[] = [];
    for (let index = 0; index < this.questions.length; index += 1) {
      const question = this.questions[index];
      const stats = this.serverStats[String(question.id)];
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
      questionId: question.id,
      correct,
      timedOut,
    });
    this.serverStats = {
      ...this.serverStats,
      [String(response.questionId)]: response.stats,
    };
    this.render();
  }

  private resetRoundState(): void {
    this.clearTimer();
    this.score = 0;
    this.currentIndex = null;
    this.answerVisible = false;
    this.timedOut = false;
    this.flash = null;
    this.secondsLeft = this.settings.secondsLimit;
    this.mistakeWeights.clear();
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

  private async apiGet<T>(path: string, redirectOnUnauthorized = true): Promise<T> {
    const separator = path.includes('?') ? '&' : '?';
    const response = await fetch(`/api/${path}${separator}_=${Date.now()}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    return this.readApiResponse<T>(response, redirectOnUnauthorized);
  }

  private async apiPost<T>(path: string, body: unknown, redirectOnUnauthorized = true): Promise<T> {
    const response = await fetch(`/api/${path}`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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

function answerCountLabel(count: number): string {
  if (count === 1) return '1 správná odpověď';
  if (count > 1 && count < 5) return `${count} správné odpovědi`;
  return `${count} správných odpovědí`;
}

const surprises: AnimalSurprise[] = Array.from({ length: 40 }, (_, index) => ({
  imagePath: `/assets/animals/animal-${String(index + 1).padStart(2, '0')}.svg`,
  animationClass: ['pop', 'floaty', 'wiggle', 'spinny', 'bounce'][index % 5],
}));
