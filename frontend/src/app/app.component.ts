import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ArrowLeft, ListRestart, LucideAngularModule, MessageCircleOff, Settings } from 'lucide-angular';

type Screen = 'login' | 'start' | 'category' | 'spellingMode' | 'mode' | 'audioPrep' | 'play' | 'settings' | 'finished';
type QuizTestType = 'multiplication' | 'english';
type ActiveGame = 'multiplication' | 'spelling';
type PracticeDirection = 'product_to_factors' | 'factors_to_product';
type PracticeMode = PracticeDirection | 'mix';
type SpellingSessionMode = 'latest' | 'older';
type TtsStatus = 'checking' | 'supported' | 'unsupported';
type AudioSource = 'browser_tts' | 'backend_mp3';
type AudioPrepStatus = 'pending' | 'generating' | 'ready' | 'error';

interface GameSettings {
  secondsLimit: number;
  targetScore: number;
  audioSource: AudioSource;
}

interface Question {
  id: number;
  q: string;
  answers: string[];
}

interface QuizTest {
  id: number;
  name: string;
  type: QuizTestType;
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

interface PracticeModeOption {
  mode: PracticeMode;
  label: string;
}

interface SpellingSet {
  id: number;
  rawWords: string;
  isLatest: boolean;
  words: SpellingWord[];
}

interface SpellingWord {
  id: number;
  text: string;
  normalized: string;
}

interface SpellingAudioWordResponse {
  word: string;
  normalized: string;
  status: 'ready' | 'missing';
  kind: 'word' | 'spelling';
  audioUrl: string | null;
}

interface AudioPrepItem {
  audioWord: string;
  normalized: string;
  word: string;
  kind: 'word' | 'spelling';
  status: AudioPrepStatus;
  audioUrl: string | null;
  error: string | null;
}

interface SpellingSession {
  setId: number;
  words: SpellingWord[];
}

interface SpellingStatsSnapshot {
  statsByWord: Record<string, QuestionStats>;
}

interface SpellingAnswerResultResponse {
  word: string;
  stats: QuestionStats;
}

interface AnimalSurprise {
  imagePath: string;
  animationClass: string;
}

interface TtsDiagnostics {
  reason: string;
  speechSynthesis: boolean;
  speechSynthesisUtterance: boolean;
  voiceCount: number;
  lastError: string | null;
  userAgent: string;
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
  readonly ttsUnavailableIcon = MessageCircleOff;
  readonly practiceModes: PracticeModeOption[] = [
    { mode: 'product_to_factors', label: 'Najdi násobení' },
    { mode: 'factors_to_product', label: 'Spočítej výsledek' },
    { mode: 'mix', label: 'Mix' },
  ];

  screen: Screen = 'login';
  loading = true;
  authLoading = false;
  authError: string | null = null;
  settingsSaved = false;
  settingsError: string | null = null;
  password = '';

  settings: GameSettings = { secondsLimit: 30, targetScore: 10, audioSource: 'browser_tts' };
  tests: QuizTest[] = [];
  selectedTest: QuizTest | null = null;
  activeGame: ActiveGame = 'multiplication';
  selectedMode: PracticeMode | null = null;
  questions: Question[] = [];
  serverStats: Record<PracticeDirection, Record<string, QuestionStats>> = {
    product_to_factors: {},
    factors_to_product: {},
  };
  spellingSetInputs: string[] = [''];
  latestSpellingSetIndex = 0;
  spellingStats: Record<string, QuestionStats> = {};
  spellingWords: SpellingWord[] = [];
  spellingWordIndex: number | null = null;
  spellingPendingIndices: number[] = [];
  score = 0;
  currentIndex: number | null = null;
  currentDirection: PracticeDirection = 'product_to_factors';
  currentFactorQuestion: string | null = null;
  answerVisible = false;
  timedOut = false;
  secondsLeft = this.settings.secondsLimit;
  flash: string | null = null;
  surprise = surprises[0];
  ttsStatus: TtsStatus = 'checking';
  ttsDiagnostics: TtsDiagnostics = createTtsDiagnostics('Kontrola TTS jeste neprobehla.', null);
  ttsDetailsVisible = false;
  audioPrepItems: AudioPrepItem[] = [];
  audioPrepError: string | null = null;
  audioPrepLoading = false;
  backendAudioUrls: Record<string, string> = {};
  backendSpellingAudioUrls: Record<string, string> = {};

  private readonly mistakeWeights: Record<PracticeDirection, Map<number, number>> = {
    product_to_factors: new Map<number, number>(),
    factors_to_product: new Map<number, number>(),
  };
  private timerId: number | null = null;
  private flashTimerId: number | null = null;
  private ttsVoicesTimerId: number | null = null;
  private ttsVoicesChangedHandler: (() => void) | null = null;
  private backendAudio: HTMLAudioElement | null = null;

  constructor(private readonly changeDetector: ChangeDetectorRef) {}

  get currentQuestion(): Question | null {
    return this.currentIndex === null ? null : this.questions[this.currentIndex] ?? null;
  }

  get currentSpellingWord(): SpellingWord | null {
    return this.spellingWordIndex === null ? null : this.spellingWords[this.spellingWordIndex] ?? null;
  }

  get hasCurrentPrompt(): boolean {
    return this.activeGame === 'spelling' ? this.currentSpellingWord !== null : this.currentQuestion !== null;
  }

  get currentQuestionText(): string {
    if (this.activeGame === 'spelling') {
      return 'Poslechni si slovo';
    }
    if (!this.currentQuestion) return '';
    return this.currentDirection === 'factors_to_product'
      ? this.currentFactorQuestion ?? ''
      : this.currentQuestion.q;
  }

  get currentAnswerText(): string {
    if (this.activeGame === 'spelling') {
      return formatSpellingAnswer(this.currentSpellingWord?.text ?? '');
    }
    if (!this.currentQuestion) return '';
    return this.currentDirection === 'factors_to_product'
      ? this.currentQuestion.q
      : this.currentQuestion.answers.join(', ');
  }

  get currentAnswerHint(): string | null {
    if (this.activeGame === 'spelling') return null;
    if (this.currentDirection !== 'product_to_factors') return null;
    const count = this.currentQuestion?.answers.length ?? 0;
    return count > 1 ? answerCountLabel(count) : null;
  }

  get scoreGoal(): number {
    return this.activeGame === 'spelling' ? this.spellingWords.length : this.settings.targetScore;
  }

  get spellingSetsConfigured(): boolean {
    return this.spellingSetInputs.some((value) => parseSpellingWords(value).length > 0);
  }

  get ttsTechnicalDetails(): string {
    const details = this.ttsDiagnostics;
    return [
      `Duvod: ${details.reason}`,
      `speechSynthesis: ${details.speechSynthesis ? 'ano' : 'ne'}`,
      `SpeechSynthesisUtterance: ${details.speechSynthesisUtterance ? 'ano' : 'ne'}`,
      `Pocet hlasu: ${details.voiceCount}`,
      `Posledni chyba: ${details.lastError ?? 'zadna'}`,
      `User agent: ${details.userAgent}`,
    ].join('\n');
  }

  get audioPrepReadyCount(): number {
    return this.audioPrepItems.filter((item) => item.status === 'ready').length;
  }

  get hasAudioPrepErrors(): boolean {
    return this.audioPrepItems.some((item) => item.status === 'error') || this.audioPrepError !== null;
  }

  async ngOnInit(): Promise<void> {
    await this.loadGameData();
  }

  ngOnDestroy(): void {
    this.clearTimer();
    this.clearFlashTimer();
    this.clearTtsVoiceCheck();
    this.stopBackendAudio();
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
    if (test.type === 'english') {
      this.activeGame = 'spelling';
      this.screen = 'category';
      this.loading = false;
      this.render();
      return;
    }
    this.activeGame = 'multiplication';
    try {
      const [productStats, factorStats, questions] = await Promise.all([
        this.apiGet<QuestionStatsSnapshot>(`tests/${test.id}/stats?direction=product_to_factors`),
        this.apiGet<QuestionStatsSnapshot>(`tests/${test.id}/stats?direction=factors_to_product`),
        this.apiGet<Question[]>(`tests/${test.id}/questions`),
      ]);
      this.serverStats = {
        product_to_factors: productStats.statsByQuestionId ?? {},
        factors_to_product: factorStats.statsByQuestionId ?? {},
      };
      this.questions = questions;
      this.screen = 'mode';
    } catch {
      this.screen = 'login';
    } finally {
      this.loading = false;
      this.render();
    }
  }

  openSpellingModes(): void {
    this.screen = 'spellingMode';
  }

  async startSpelling(mode: SpellingSessionMode): Promise<void> {
    this.loading = true;
    this.activeGame = 'spelling';
    this.resetRoundState();
    try {
      const [stats, settings, session] = await Promise.all([
        this.apiGet<SpellingStatsSnapshot>('spelling/stats'),
        this.apiGet<GameSettings>('settings'),
        this.apiGet<SpellingSession>(`spelling/session?mode=${mode}`),
      ]);
      this.applySettings(settings);
      this.spellingStats = stats.statsByWord ?? {};
      this.spellingWords = session.words;
      this.spellingPendingIndices = this.spellingWords.map((_, index) => index);
      if (this.settings.audioSource === 'backend_mp3') {
        this.screen = 'audioPrep';
        this.loading = false;
        this.render();
        await this.prepareBackendAudio();
        return;
      }
      this.startSpellingGame();
    } catch {
      this.spellingWords = [];
      this.spellingPendingIndices = [];
      this.screen = 'play';
      if (this.settings.audioSource === 'browser_tts') {
        this.checkTtsSupport();
      }
    } finally {
      this.loading = false;
      this.render();
    }
  }

  startPractice(mode: PracticeMode): void {
    this.activeGame = 'multiplication';
    this.selectedMode = mode;
    this.resetRoundState();
    this.screen = 'play';
    this.pickQuestion();
    this.render();
  }

  showAnswer(): void {
    this.answerVisible = true;
    this.clearTimer();
    if (this.activeGame === 'spelling') {
      window.setTimeout(() => this.playCurrentSpellingLettersAudio(), 120);
    }
  }

  replaySpellingAudio(): void {
    this.playCurrentSpellingAudio();
  }

  replaySpellingAnswerAudio(): void {
    this.playCurrentSpellingLettersAudio();
  }

  async retryAudioGeneration(): Promise<void> {
    if (this.activeGame !== 'spelling' || this.spellingWords.length === 0) return;
    await this.prepareBackendAudio();
  }

  toggleTtsDetails(): void {
    this.ttsDetailsVisible = !this.ttsDetailsVisible;
  }

  markWrong(): void {
    const index = this.activeGame === 'spelling' ? this.spellingWordIndex : this.currentIndex;
    if (index === null) return;
    this.score -= 1;
    this.incrementMistakeWeight(index);
    void this.recordAnswer(index, false, false);
    if (this.activeGame === 'spelling') {
      this.advanceSpellingQueue(false);
    }
    this.showPenalty();
    this.pickQuestion();
  }

  markCorrect(): void {
    const index = this.activeGame === 'spelling' ? this.spellingWordIndex : this.currentIndex;
    if (index === null) return;
    const nextScore = this.score + 1;
    this.score = nextScore;
    this.decrementMistakeWeight(index);
    void this.recordAnswer(index, true, false);
    if (this.activeGame === 'spelling') {
      this.advanceSpellingQueue(true);
    }
    if (this.finishIfNeeded(nextScore)) return;
    this.pickQuestion();
  }

  nextAfterTimeout(): void {
    if (this.activeGame === 'spelling') {
      this.advanceSpellingQueue(false);
    }
    this.pickQuestion();
  }

  async openSettings(): Promise<void> {
    this.clearTimer();
    this.ttsDetailsVisible = false;
    this.settingsSaved = false;
    this.settingsError = null;
    this.screen = 'settings';
    this.loading = true;
    this.render();
    try {
      await Promise.all([
        this.loadSettings(),
        this.loadSpellingSets(),
      ]);
    } catch {
      this.settingsError = 'Nastavení se nepodařilo načíst.';
    } finally {
      this.loading = false;
      this.render();
    }
  }

  async saveSettingsOnly(): Promise<void> {
    this.settingsSaved = false;
    this.settingsError = null;
    this.loading = true;
    try {
      const [savedSettings] = await Promise.all([
        this.apiPut<GameSettings>('settings', this.normalizedSettings()),
        this.apiPut<SpellingSet[]>('spelling/sets', {
          sets: this.spellingSetInputs,
          latestSetIndex: this.latestSpellingSetIndex,
        }),
      ]);
      this.applySettings(savedSettings);
      await this.loadSpellingSets();
      this.settingsSaved = true;
    } catch {
      this.settingsError = 'Nastavení se nepodařilo uložit.';
    } finally {
      this.loading = false;
      this.render();
    }
  }

  addSpellingSet(): void {
    this.spellingSetInputs = [...this.spellingSetInputs, ''];
    this.latestSpellingSetIndex = this.spellingSetInputs.length - 1;
  }

  removeSpellingSet(index: number): void {
    this.spellingSetInputs = this.spellingSetInputs.filter((_, candidateIndex) => candidateIndex !== index);
    if (this.spellingSetInputs.length === 0) {
      this.spellingSetInputs = [''];
    }
    if (this.latestSpellingSetIndex === index) {
      this.latestSpellingSetIndex = this.lastConfiguredSpellingSetIndex();
    } else if (this.latestSpellingSetIndex > index) {
      this.latestSpellingSetIndex -= 1;
    }
    this.latestSpellingSetIndex = Math.min(this.latestSpellingSetIndex, this.spellingSetInputs.length - 1);
  }

  returnToTestSelection(): void {
    this.clearTimer();
    this.clearFlashTimer();
    this.ttsDetailsVisible = false;
    this.resetRoundState();
    this.selectedTest = null;
    this.selectedMode = null;
    this.questions = [];
    this.serverStats = emptyStatsByDirection();
    this.spellingWords = [];
    this.spellingPendingIndices = [];
    this.spellingStats = {};
    this.audioPrepItems = [];
    this.audioPrepError = null;
    this.backendAudioUrls = {};
    this.backendSpellingAudioUrls = {};
    this.screen = this.tests.length > 0 ? 'start' : 'settings';
    this.render();
  }

  private async loadGameData(): Promise<void> {
    this.loading = true;
    try {
      const auth = await this.apiGet<AuthStatusResponse>('auth/status');
      if (!auth.authenticated) {
        this.tests = [];
        this.selectedTest = null;
        this.selectedMode = null;
        this.questions = [];
        this.serverStats = emptyStatsByDirection();
        this.spellingWords = [];
        this.spellingPendingIndices = [];
        this.spellingStats = {};
        this.screen = 'login';
        return;
      }
      const [tests, settings] = await Promise.all([
        this.apiGet<QuizTest[]>('tests'),
        this.apiGet<GameSettings>('settings'),
        this.loadSpellingSets(),
      ]);
      this.applySettings(settings);
      this.tests = tests;
      this.selectedTest = null;
      this.selectedMode = null;
      this.questions = [];
      this.serverStats = emptyStatsByDirection();
      this.spellingWords = [];
      this.spellingPendingIndices = [];
      this.spellingStats = {};
      this.screen = this.tests.length > 0 ? 'start' : 'settings';
    } catch {
      this.screen = 'login';
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private async loadSettings(): Promise<void> {
    this.applySettings(await this.apiGet<GameSettings>('settings'));
  }

  private normalizedSettings(): GameSettings {
    return {
      secondsLimit: Math.max(1, Math.floor(Number(this.settings.secondsLimit) || 10)),
      targetScore: Math.max(1, Math.floor(Number(this.settings.targetScore) || 10)),
      audioSource: this.settings.audioSource === 'backend_mp3' ? 'backend_mp3' : 'browser_tts',
    };
  }

  private applySettings(settings: GameSettings): void {
    this.settings = {
      secondsLimit: Math.max(1, Math.floor(Number(settings.secondsLimit) || 30)),
      targetScore: Math.max(1, Math.floor(Number(settings.targetScore) || 10)),
      audioSource: settings.audioSource === 'backend_mp3' ? 'backend_mp3' : 'browser_tts',
    };
    this.secondsLeft = this.settings.secondsLimit;
  }

  private startSpellingGame(): void {
    this.screen = 'play';
    if (this.settings.audioSource === 'browser_tts') {
      this.checkTtsSupport();
    } else {
      this.ttsDetailsVisible = false;
    }
    this.pickQuestion();
  }

  private async prepareBackendAudio(): Promise<void> {
    this.audioPrepLoading = true;
    this.audioPrepError = null;
    this.backendAudioUrls = {};
    this.backendSpellingAudioUrls = {};
    try {
      this.audioPrepItems = this.spellingWords.flatMap((word) => [
        {
          audioWord: word.text,
          normalized: word.normalized,
          word: word.text,
          kind: 'word' as const,
          status: 'pending' as const,
          audioUrl: null,
          error: null,
        },
        {
          audioWord: word.text,
          normalized: word.normalized,
          word: formatSpellingAnswer(word.text),
          kind: 'spelling' as const,
          status: 'pending' as const,
          audioUrl: null,
          error: null,
        },
      ]);
      this.render();

      await Promise.all(this.audioPrepItems.map((item) => this.loadAudioItemStatus(item)));
      this.backendAudioUrls = Object.fromEntries(
        this.audioPrepItems
          .filter((item) => item.kind === 'word' && item.audioUrl)
          .map((item) => [item.normalized, item.audioUrl as string]),
      );
      this.backendSpellingAudioUrls = Object.fromEntries(
        this.audioPrepItems
          .filter((item) => item.kind === 'spelling' && item.audioUrl)
          .map((item) => [item.normalized, item.audioUrl as string]),
      );
      this.render();

      const missingItems = this.audioPrepItems.filter((item) => item.status !== 'ready');
      await this.generateMissingAudio(missingItems);
      if (this.audioPrepItems.some((item) => item.status === 'error')) return;
      this.audioPrepLoading = false;
      this.startSpellingGame();
    } catch (error) {
      this.audioPrepError = error instanceof Error ? error.message : 'Audio se nepodařilo připravit.';
    } finally {
      this.audioPrepLoading = false;
      this.render();
    }
  }

  private async loadAudioItemStatus(item: AudioPrepItem): Promise<void> {
    const response = await this.apiGet<SpellingAudioWordResponse>(this.spellingAudioPath(item.audioWord, item.kind));
    if (response.status !== 'ready' || !response.audioUrl) return;
    this.updateAudioPrepItem(item.normalized, item.kind, {
      status: 'ready',
      audioUrl: response.audioUrl,
      error: null,
    });
  }

  private async generateMissingAudio(items: AudioPrepItem[]): Promise<void> {
    const queue = [...items];
    const workers = Array.from({ length: Math.min(2, queue.length) }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) return;
        await this.generateAudioItem(item);
      }
    });
    await Promise.all(workers);
  }

  private async generateAudioItem(item: AudioPrepItem): Promise<void> {
    this.updateAudioPrepItem(item.normalized, item.kind, { status: 'generating', error: null });
    try {
      const response = await this.apiPost<SpellingAudioWordResponse>(this.spellingAudioPath(item.audioWord, item.kind), {});
      if (!response.audioUrl) {
        throw new Error('Audio URL chybi.');
      }
      if (response.kind === 'spelling') {
        this.backendSpellingAudioUrls = {
          ...this.backendSpellingAudioUrls,
          [response.normalized]: response.audioUrl,
        };
      } else {
        this.backendAudioUrls = {
          ...this.backendAudioUrls,
          [response.normalized]: response.audioUrl,
        };
      }
      this.updateAudioPrepItem(item.normalized, item.kind, { status: 'ready', audioUrl: response.audioUrl, error: null });
    } catch (error) {
      this.audioPrepError = error instanceof Error ? error.message : 'Generování selhalo.';
      this.updateAudioPrepItem(item.normalized, item.kind, {
        status: 'error',
        error: this.audioPrepError,
      });
    }
  }

  private updateAudioPrepItem(normalized: string, kind: AudioPrepItem['kind'], update: Partial<AudioPrepItem>): void {
    this.audioPrepItems = this.audioPrepItems.map((item) => (
      item.normalized === normalized && item.kind === kind ? { ...item, ...update } : item
    ));
    this.render();
  }

  private spellingAudioPath(word: string, kind: AudioPrepItem['kind']): string {
    return `spelling/audio/words/${encodeURIComponent(word)}?kind=${kind}`;
  }

  private pickQuestion(): void {
    this.clearTimer();
    if (this.activeGame === 'spelling') {
      this.pickSpellingWord();
      return;
    }
    if (this.questions.length === 0) {
      this.currentIndex = null;
      this.screen = this.selectedTest ? 'mode' : 'start';
      return;
    }

    const direction = this.pickDirection();
    const weightedIndices: number[] = [];
    for (let index = 0; index < this.questions.length; index += 1) {
      const question = this.questions[index];
      const stats = this.serverStats[direction][String(question.id)];
      const mistakes = stats ? stats.wrong + stats.timeout : 0;
      const longTermDifficulty = stats ? Math.max(0, mistakes * 2 - stats.correct) : 0;
      const sessionDifficulty = this.mistakeWeights[direction].get(index) ?? 0;
      const weight = 1 + longTermDifficulty * 2 + sessionDifficulty * 3;
      for (let copy = 0; copy < weight; copy += 1) {
        weightedIndices.push(index);
      }
    }

    this.currentIndex = weightedIndices[Math.floor(Math.random() * weightedIndices.length)] ?? 0;
    this.currentDirection = direction;
    this.currentFactorQuestion = this.pickFactorQuestion(this.questions[this.currentIndex]);
    this.answerVisible = false;
    this.timedOut = false;
    this.secondsLeft = this.settings.secondsLimit;
    this.startTimer();
  }

  private pickSpellingWord(): void {
    if (this.spellingWords.length === 0) {
      this.spellingWordIndex = null;
      return;
    }
    const nextIndex = this.spellingPendingIndices[0];
    if (nextIndex === undefined) {
      this.clearTimer();
      this.surprise = surprises[Math.floor(Math.random() * surprises.length)] ?? surprises[0];
      this.screen = 'finished';
      return;
    }
    this.spellingWordIndex = nextIndex;
    this.answerVisible = false;
    this.timedOut = false;
    this.secondsLeft = this.settings.secondsLimit;
    this.startTimer();
    window.setTimeout(() => this.playCurrentSpellingAudio(), 120);
  }

  private advanceSpellingQueue(correct: boolean): void {
    const currentIndex = this.spellingWordIndex;
    if (currentIndex === null || this.spellingPendingIndices.length === 0) return;
    this.spellingPendingIndices = this.spellingPendingIndices.filter((index) => index !== currentIndex);
    if (!correct) {
      this.spellingPendingIndices = [...this.spellingPendingIndices, currentIndex];
    }
  }

  private checkTtsSupport(): void {
    this.clearTtsVoiceCheck();
    this.ttsDetailsVisible = false;

    const speech = window.speechSynthesis;
    const hasSpeech = typeof speech !== 'undefined';
    const hasUtterance = typeof window.SpeechSynthesisUtterance !== 'undefined';
    if (!hasSpeech || !hasUtterance) {
      this.setTtsUnsupported('Web Speech API neni v tomto prohlizeci dostupne.');
      return;
    }

    this.ttsStatus = 'checking';
    this.ttsDiagnostics = createTtsDiagnostics('Cekam na nacteni TTS hlasu.', null);
    const updateFromVoices = (): boolean => {
      const voiceCount = speech.getVoices().length;
      if (voiceCount > 0) {
        this.clearTtsVoiceCheck();
        this.ttsStatus = 'supported';
        this.ttsDiagnostics = createTtsDiagnostics('TTS hlasy jsou dostupne.', null, voiceCount);
        this.ttsDetailsVisible = false;
        this.render();
        return true;
      }
      return false;
    };

    if (updateFromVoices()) return;

    this.ttsVoicesChangedHandler = updateFromVoices;
    speech.addEventListener?.('voiceschanged', updateFromVoices);
    this.ttsVoicesTimerId = window.setTimeout(() => {
      const voiceCount = speech.getVoices().length;
      if (voiceCount === 0) {
        this.setTtsUnsupported('Prohlizec nevratil zadne TTS hlasy.', null, voiceCount);
      }
    }, 1500);
  }

  private startTimer(): void {
    this.clearTimer();
    this.timerId = window.setInterval(() => {
      const hasCurrentItem = this.activeGame === 'spelling' ? this.spellingWordIndex !== null : this.currentIndex !== null;
      if (this.screen !== 'play' || this.answerVisible || !hasCurrentItem) {
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
    const index = this.activeGame === 'spelling' ? this.spellingWordIndex : this.currentIndex;
    if (index === null || this.answerVisible) return;
    this.clearTimer();
    this.timedOut = true;
    this.answerVisible = true;
    this.score -= 1;
    this.incrementMistakeWeight(index);
    void this.recordAnswer(index, false, true);
    this.showPenalty();
    this.render();
  }

  private finishIfNeeded(nextScore: number): boolean {
    if (this.activeGame === 'spelling') return false;
    if (nextScore < this.settings.targetScore) return false;
    this.clearTimer();
    this.surprise = surprises[Math.floor(Math.random() * surprises.length)] ?? surprises[0];
    this.screen = 'finished';
    return true;
  }

  private async recordAnswer(index: number, correct: boolean, timedOut: boolean): Promise<void> {
    if (this.activeGame === 'spelling') {
      await this.recordSpellingAnswer(index, correct, timedOut);
      return;
    }
    const question = this.questions[index];
    const test = this.selectedTest;
    if (!question || !test) return;
    const direction = this.currentDirection;
    const response = await this.apiPost<AnswerResultResponse>(`tests/${test.id}/stats/answer`, {
      questionId: question.id,
      correct,
      timedOut,
      direction,
    });
    this.serverStats = {
      ...this.serverStats,
      [direction]: {
        ...this.serverStats[direction],
        [String(response.questionId)]: response.stats,
      },
    };
    this.render();
  }

  private async recordSpellingAnswer(index: number, correct: boolean, timedOut: boolean): Promise<void> {
    const word = this.spellingWords[index];
    if (!word) return;
    const response = await this.apiPost<SpellingAnswerResultResponse>('spelling/stats/answer', {
      word: word.normalized,
      correct,
      timedOut,
    });
    this.spellingStats = {
      ...this.spellingStats,
      [response.word]: response.stats,
    };
    this.render();
  }

  private resetRoundState(): void {
    this.clearTimer();
    this.stopBackendAudio();
    this.score = 0;
    this.currentIndex = null;
    this.spellingWordIndex = null;
    this.currentDirection = 'product_to_factors';
    this.currentFactorQuestion = null;
    this.spellingPendingIndices = [];
    this.audioPrepItems = [];
    this.audioPrepError = null;
    this.audioPrepLoading = false;
    this.backendAudioUrls = {};
    this.backendSpellingAudioUrls = {};
    this.answerVisible = false;
    this.timedOut = false;
    this.flash = null;
    this.secondsLeft = this.settings.secondsLimit;
    this.mistakeWeights.product_to_factors.clear();
    this.mistakeWeights.factors_to_product.clear();
  }

  private pickDirection(): PracticeDirection {
    if (this.selectedMode === 'factors_to_product') return 'factors_to_product';
    if (this.selectedMode === 'mix') {
      return Math.random() < 0.5 ? 'product_to_factors' : 'factors_to_product';
    }
    return 'product_to_factors';
  }

  private pickFactorQuestion(question: Question | undefined): string | null {
    if (!question || question.answers.length === 0) return null;
    return question.answers[Math.floor(Math.random() * question.answers.length)] ?? question.answers[0];
  }

  private incrementMistakeWeight(index: number): void {
    if (this.activeGame === 'spelling') return;
    const weights = this.mistakeWeights[this.currentDirection];
    weights.set(index, (weights.get(index) ?? 0) + 1);
  }

  private decrementMistakeWeight(index: number): void {
    if (this.activeGame === 'spelling') return;
    const weights = this.mistakeWeights[this.currentDirection];
    weights.set(index, Math.max(0, (weights.get(index) ?? 0) - 1));
  }

  private async loadSpellingSets(): Promise<void> {
    const sets = await this.apiGet<SpellingSet[]>('spelling/sets');
    this.spellingSetInputs = sets.length > 0 ? sets.map((set) => set.rawWords) : [''];
    const latestIndex = sets.findIndex((set) => set.isLatest);
    this.latestSpellingSetIndex = latestIndex >= 0 ? latestIndex : this.lastConfiguredSpellingSetIndex();
  }

  private lastConfiguredSpellingSetIndex(): number {
    for (let index = this.spellingSetInputs.length - 1; index >= 0; index -= 1) {
      if (parseSpellingWords(this.spellingSetInputs[index]).length > 0) {
        return index;
      }
    }
    return Math.max(0, this.spellingSetInputs.length - 1);
  }

  private playCurrentSpellingAudio(): void {
    if (this.settings.audioSource === 'backend_mp3') {
      this.playCurrentBackendAudio();
      return;
    }
    const word = this.currentSpellingWord?.text;
    const speech = window.speechSynthesis;
    if (!word) return;
    if (!speech || typeof window.SpeechSynthesisUtterance === 'undefined') {
      this.setTtsUnsupported('Web Speech API neni v tomto prohlizeci dostupne.');
      return;
    }
    speech.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-US';
    utterance.rate = 0.86;
    utterance.onerror = (event) => {
      this.setTtsUnsupported('Prehrani TTS skoncilo chybou.', event.error, speech.getVoices().length);
    };
    try {
      speech.speak(utterance);
    } catch (error) {
      this.setTtsUnsupported('Prehrani TTS selhalo.', error instanceof Error ? error.message : String(error), speech.getVoices().length);
    }
  }

  private playCurrentSpellingLettersAudio(): void {
    if (this.settings.audioSource === 'backend_mp3') {
      this.playCurrentBackendSpellingAudio();
      return;
    }
    const word = this.currentSpellingWord?.text;
    const speech = window.speechSynthesis;
    if (!word) return;
    if (!speech || typeof window.SpeechSynthesisUtterance === 'undefined') {
      this.setTtsUnsupported('Web Speech API neni v tomto prohlizeci dostupne.');
      return;
    }
    speech.cancel();
    const utterance = new SpeechSynthesisUtterance(formatSpellingSpeech(word));
    utterance.lang = 'en-US';
    utterance.rate = 0.82;
    utterance.onerror = (event) => {
      this.setTtsUnsupported('Prehrani spelling TTS skoncilo chybou.', event.error, speech.getVoices().length);
    };
    try {
      speech.speak(utterance);
    } catch (error) {
      this.setTtsUnsupported('Prehrani spelling TTS selhalo.', error instanceof Error ? error.message : String(error), speech.getVoices().length);
    }
  }

  private playCurrentBackendAudio(): void {
    const word = this.currentSpellingWord;
    if (!word) return;
    const audioUrl = this.backendAudioUrls[word.normalized];
    if (!audioUrl) return;
    this.stopBackendAudio();
    this.backendAudio = new Audio(audioUrl);
    void this.backendAudio.play();
  }

  private playCurrentBackendSpellingAudio(): void {
    const word = this.currentSpellingWord;
    if (!word) return;
    const audioUrl = this.backendSpellingAudioUrls[word.normalized];
    if (!audioUrl) return;
    this.stopBackendAudio();
    this.backendAudio = new Audio(audioUrl);
    void this.backendAudio.play();
  }

  private stopBackendAudio(): void {
    if (!this.backendAudio) return;
    this.backendAudio.pause();
    this.backendAudio = null;
  }

  private setTtsUnsupported(reason: string, lastError: string | null = null, voiceCount?: number): void {
    this.clearTtsVoiceCheck();
    this.ttsStatus = 'unsupported';
    this.ttsDiagnostics = createTtsDiagnostics(reason, lastError, voiceCount);
    this.render();
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

  private async apiPut<T>(path: string, body: unknown, redirectOnUnauthorized = true): Promise<T> {
    const response = await fetch(`/api/${path}`, {
      method: 'PUT',
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
      const body = await response.text();
      const apiError = parseApiError(body);
      throw new Error(apiError ?? `API ${response.status}`);
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

  private clearTtsVoiceCheck(): void {
    if (this.ttsVoicesTimerId !== null) {
      window.clearTimeout(this.ttsVoicesTimerId);
      this.ttsVoicesTimerId = null;
    }
    if (this.ttsVoicesChangedHandler !== null && window.speechSynthesis) {
      window.speechSynthesis.removeEventListener?.('voiceschanged', this.ttsVoicesChangedHandler);
      this.ttsVoicesChangedHandler = null;
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

function parseSpellingWords(rawWords: string): string[] {
  return rawWords.split(',').map((word) => word.trim()).filter(Boolean);
}

function spellingLetters(word: string): string[] {
  return word.trim().split('').filter((letter) => /[\p{L}\p{N}]/u.test(letter));
}

function formatSpellingAnswer(word: string): string {
  return spellingLetters(word).map((letter) => letter.toLocaleUpperCase('en-US')).join('-');
}

function formatSpellingSpeech(word: string): string {
  return spellingLetters(word).map((letter) => letter.toLocaleUpperCase('en-US')).join(', ');
}

function emptyStatsByDirection(): Record<PracticeDirection, Record<string, QuestionStats>> {
  return {
    product_to_factors: {},
    factors_to_product: {},
  };
}

function createTtsDiagnostics(reason: string, lastError: string | null, voiceCount?: number): TtsDiagnostics {
  const speech = window.speechSynthesis;
  const hasSpeech = typeof speech !== 'undefined';
  return {
    reason,
    speechSynthesis: hasSpeech,
    speechSynthesisUtterance: typeof window.SpeechSynthesisUtterance !== 'undefined',
    voiceCount: voiceCount ?? (hasSpeech ? speech.getVoices().length : 0),
    lastError,
    userAgent: navigator.userAgent,
  };
}

function parseApiError(body: string): string | null {
  if (!body) return null;
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    return typeof parsed.error === 'string' ? parsed.error : null;
  } catch {
    return body.slice(0, 160);
  }
}

const surprises: AnimalSurprise[] = Array.from({ length: 40 }, (_, index) => ({
  imagePath: `/assets/animals/animal-${String(index + 1).padStart(2, '0')}.svg`,
  animationClass: ['pop', 'floaty', 'wiggle', 'spinny', 'bounce'][index % 5],
}));
