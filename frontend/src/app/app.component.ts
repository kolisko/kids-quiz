import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ArrowLeft, CarFront, ListRestart, LucideAngularModule, MessageCircleOff, Play, Settings } from 'lucide-angular';

type Screen = 'login' | 'start' | 'category' | 'spellingMode' | 'mode' | 'audioPrep' | 'play' | 'settings' | 'assetLibrary' | 'finished';
type QuizTestType = 'multiplication' | 'english';
type ActiveGame = 'multiplication' | 'spelling' | 'flipcards';
type PracticeDirection = 'product_to_factors' | 'factors_to_product';
type PracticeMode = PracticeDirection | 'mix';
type SpellingSessionMode = 'latest' | 'older';
type LearningLanguage = 'en' | 'de' | 'es';
type TtsStatus = 'checking' | 'supported' | 'unsupported';
type AudioSource = 'browser_tts' | 'backend_mp3';
type ArtifactStatus = 'ready' | 'missing' | 'queued' | 'generating' | 'error';
type AudioPrepStatus = 'pending' | ArtifactStatus;
type FlipcardSource = 'all_words' | 'ready_only';
type AssetLibraryTab = 'images' | 'audio';
type PollToken = { cancelled: boolean };
type AssetLibraryPollToken = PollToken & { language: LearningLanguage };

const AUDIO_PREROLL_MS = 220;
const AUDIO_PREROLL_URL = createSilentWavDataUrl(AUDIO_PREROLL_MS);
const TESLA_AUDIO_PRIME_MS = 1000;
const TESLA_SILENT_LOOP_URL = createSilentWavDataUrl(TESLA_AUDIO_PRIME_MS);
const TESLA_MP3_AUDIO_STORAGE_KEY = 'kidsQuizTeslaMp3AudioEnabled';

interface LanguageOption {
  code: LearningLanguage;
  label: string;
  ttsLang: string;
}

interface GameSettings {
  secondsLimit: number;
  targetScore: number;
  audioSource: AudioSource;
  flipcardSource: FlipcardSource;
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
  language: LearningLanguage;
}

interface SpellingWord {
  id: number;
  text: string;
  normalized: string;
}

interface SpellingAudioWordResponse {
  word: string;
  normalized: string;
  status: ArtifactStatus;
  kind: 'word' | 'spelling';
  audioUrl: string | null;
  error?: string | null;
}

interface AudioPrepItem {
  audioWord: string;
  normalized: string;
  word: string;
  kind: 'word' | 'spelling' | 'flipcard_image';
  status: AudioPrepStatus;
  audioUrl: string | null;
  error: string | null;
}

interface SpellingSession {
  setId: number;
  words: SpellingWord[];
  language: LearningLanguage;
}

interface SpellingStatsSnapshot {
  statsByWord: Record<string, QuestionStats>;
}

interface SpellingAnswerResultResponse {
  word: string;
  stats: QuestionStats;
}

interface FlipcardWord {
  text: string;
  normalized: string;
  conceptKey: string;
}

interface FlipcardWordsResponse {
  words: string;
  items: FlipcardWord[];
}

interface FlipcardSession {
  words: FlipcardWord[];
  language: LearningLanguage;
}

interface FlipcardImageResponse {
  word: string;
  normalized: string;
  status: ArtifactStatus;
  imageUrl: string | null;
  error?: string | null;
}

interface FlipcardAsset {
  word: string;
  normalized: string;
  conceptKey: string;
  language: LearningLanguage;
  imageStatus: ArtifactStatus;
  imageUrl: string | null;
  imageError?: string | null;
  audioStatus: ArtifactStatus;
  audioUrl: string | null;
  audioError?: string | null;
}

interface FlipcardAssetsResponse {
  items: FlipcardAsset[];
}

interface FlipcardAssetBulkEnqueueResponse {
  total: number;
  queued: number;
  alreadyReady: number;
  alreadyActive: number;
}

interface FlipcardTranslationBackfillStatusResponse {
  language: LearningLanguage;
  status: ArtifactStatus;
  readyCount: number;
  totalCount: number;
  error?: string | null;
  updatedAt?: string | null;
}

interface FlipcardStatsSnapshot {
  statsByWord: Record<string, QuestionStats>;
}

interface FlipcardAnswerResultResponse {
  word: string;
  stats: QuestionStats;
}

interface FlipcardOption {
  word: FlipcardWord;
  disabled: boolean;
  wrongFeedback?: boolean;
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
  readonly playIcon = Play;
  readonly teslaAudioIcon = CarFront;
  readonly practiceModes: PracticeModeOption[] = [
    { mode: 'product_to_factors', label: 'Najdi násobení' },
    { mode: 'factors_to_product', label: 'Spočítej výsledek' },
    { mode: 'mix', label: 'Mix' },
  ];
  readonly languageOptions: LanguageOption[] = [
    { code: 'en', label: 'Angličtina', ttsLang: 'en-US' },
    { code: 'de', label: 'Němčina', ttsLang: 'de-DE' },
    { code: 'es', label: 'Španělština', ttsLang: 'es-ES' },
  ];

  screen: Screen = 'login';
  loading = true;
  authLoading = false;
  authError: string | null = null;
  settingsSaved = false;
  settingsError: string | null = null;
  password = '';
  snapshotNumber = 'dev';

  settings: GameSettings = { secondsLimit: 30, targetScore: 10, audioSource: 'browser_tts', flipcardSource: 'all_words' };
  tests: QuizTest[] = [];
  selectedTest: QuizTest | null = null;
  selectedLanguage: LearningLanguage = 'en';
  settingsLanguage: LearningLanguage = 'en';
  activeGame: ActiveGame = 'multiplication';
  selectedMode: PracticeMode | null = null;
  questions: Question[] = [];
  serverStats: Record<PracticeDirection, Record<string, QuestionStats>> = {
    product_to_factors: {},
    factors_to_product: {},
  };
  spellingSetInputsByLanguage: Record<LearningLanguage, string[]> = { en: [''], de: [''], es: [''] };
  flipcardWordInputByLanguage: Record<LearningLanguage, string> = { en: '', de: '', es: '' };
  latestSpellingSetIndexByLanguage: Record<LearningLanguage, number> = { en: 0, de: 0, es: 0 };
  spellingStats: Record<string, QuestionStats> = {};
  flipcardStats: Record<string, QuestionStats> = {};
  spellingWords: SpellingWord[] = [];
  flipcardWords: FlipcardWord[] = [];
  flipcardAnswerPool: FlipcardWord[] = [];
  flipcardQueue: number[] = [];
  flipcardWordIndex: number | null = null;
  flipcardOptions: FlipcardOption[] = [];
  flipcardOptionsByIndex: FlipcardOption[][] = [];
  flipcardAttemptFailed = false;
  flipcardImageLoaded = false;
  flipcardImageError: string | null = null;
  spellingWordIndex: number | null = null;
  spellingPendingIndices: number[] = [];
  startingSpellingMode: SpellingSessionMode | null = null;
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
  assetLibraryTab: AssetLibraryTab = 'images';
  assetLibraryLanguage: LearningLanguage = 'en';
  flipcardAssets: FlipcardAsset[] = [];
  assetLibraryLoading = false;
  assetLibraryError: string | null = null;
  assetImageGenerating: Record<string, boolean> = {};
  assetAudioGenerating: Record<string, boolean> = {};
  assetImageBulkEnqueueLoading = false;
  assetAudioBulkEnqueueLoading = false;
  assetImageErrors: Record<string, string> = {};
  assetAudioErrors: Record<string, string> = {};
  translationBackfillStatusByLanguage: Record<LearningLanguage, FlipcardTranslationBackfillStatusResponse | null> = { en: null, de: null, es: null };
  translationBackfillLoading = false;
  translationBackfillError: string | null = null;
  backendAudioUrls: Record<string, string> = {};
  backendSpellingAudioUrls: Record<string, string> = {};
  flipcardImageUrls: Record<string, string> = {};
  flipcardAdvancing = false;
  teslaMp3AudioEnabled = readLocalBoolean(TESLA_MP3_AUDIO_STORAGE_KEY, false);

  private readonly mistakeWeights: Record<PracticeDirection, Map<number, number>> = {
    product_to_factors: new Map<number, number>(),
    factors_to_product: new Map<number, number>(),
  };
  private timerId: number | null = null;
  private flashTimerId: number | null = null;
  private ttsVoicesTimerId: number | null = null;
  private ttsVoicesChangedHandler: (() => void) | null = null;
  private backendAudio: HTMLAudioElement | null = null;
  private teslaMp3Audio: TeslaMp3AudioController | null = null;
  private teslaMp3GestureHandler: (() => void) | null = null;
  private backendPlaybackToken = 0;
  private ttsPlaybackToken = 0;
  private assetLibraryPollToken: AssetLibraryPollToken | null = null;
  private audioPrepPollToken: PollToken | null = null;
  private translationBackfillPollTokens: Partial<Record<LearningLanguage, PollToken>> = {};
  private readonly flipcardImagePreloads = new Map<string, HTMLImageElement>();
  private readonly flipcardAudioPreloads = new Map<string, HTMLAudioElement>();

  constructor(private readonly changeDetector: ChangeDetectorRef) {}

  get currentQuestion(): Question | null {
    return this.currentIndex === null ? null : this.questions[this.currentIndex] ?? null;
  }

  get currentSpellingWord(): SpellingWord | null {
    return this.spellingWordIndex === null ? null : this.spellingWords[this.spellingWordIndex] ?? null;
  }

  get currentFlipcardWord(): FlipcardWord | null {
    return this.flipcardWordIndex === null ? null : this.flipcardWords[this.flipcardWordIndex] ?? null;
  }

  get hasCurrentPrompt(): boolean {
    if (this.activeGame === 'spelling') return this.currentSpellingWord !== null;
    if (this.activeGame === 'flipcards') return this.currentFlipcardWord !== null;
    return this.currentQuestion !== null;
  }

  get teslaMp3AudioModeActive(): boolean {
    return this.teslaMp3AudioEnabled && this.settings.audioSource === 'backend_mp3';
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

  get currentFlipcardImageUrl(): string | null {
    const word = this.currentFlipcardWord;
    return word ? this.flipcardImageUrls[word.conceptKey] ?? null : null;
  }

  get flipcardAnswersDisabled(): boolean {
    return this.flipcardAdvancing || !this.flipcardImageLoaded || this.flipcardImageError !== null;
  }

  get currentAnswerText(): string {
    if (this.activeGame === 'spelling') {
      return formatSpellingAnswer(this.currentSpellingWord?.text ?? '', this.selectedLanguage);
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
    if (this.activeGame === 'spelling') return this.spellingWords.length;
    if (this.activeGame === 'flipcards') return this.flipcardWords.length;
    return this.settings.targetScore;
  }

  get spellingSetsConfigured(): boolean {
    return this.spellingSetInputsByLanguage[this.settingsLanguage].some((value) => parseSpellingWords(value).length > 0);
  }

  get multiplicationTests(): QuizTest[] {
    return this.tests.filter((test) => test.type !== 'english');
  }

  get selectedLanguageLabel(): string {
    return this.languageLabel(this.selectedLanguage);
  }

  get settingsLanguageLabel(): string {
    return this.languageLabel(this.settingsLanguage);
  }

  get assetLibraryLanguageLabel(): string {
    return this.languageLabel(this.assetLibraryLanguage);
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

  get visibleAudioPrepItems(): AudioPrepItem[] {
    const hasWork = this.audioPrepItems.some((item) => item.status === 'queued' || item.status === 'generating' || item.status === 'error');
    return hasWork ? this.audioPrepItems : this.audioPrepItems.filter((item) => item.status === 'queued' || item.status === 'generating' || item.status === 'error');
  }

  get audioPrepSummary(): string {
    if (this.hasAudioPrepErrors) return 'Některé položky se nepodařilo připravit.';
    if (this.visibleAudioPrepItems.length > 0) {
      return `Připravuji ${this.audioPrepReadyCount} / ${this.audioPrepItems.length} položek...`;
    }
    return `Kontroluji ${this.audioPrepItems.length} položek...`;
  }

  get audioPrepReadyCount(): number {
    return this.audioPrepItems.filter((item) => item.status === 'ready').length;
  }

  get hasAudioPrepErrors(): boolean {
    return this.audioPrepItems.some((item) => item.status === 'error') || this.audioPrepError !== null;
  }

  get audioPrepActionsVisible(): boolean {
    return !this.audioPrepLoading || this.hasAudioPrepErrors;
  }

  get missingImageAssetsCount(): number {
    return this.flipcardAssets.filter((asset) => asset.imageStatus === 'missing' || asset.imageStatus === 'error').length;
  }

  get queuedImageAssetsCount(): number {
    return this.flipcardAssets.filter((asset) => asset.imageStatus === 'queued' || asset.imageStatus === 'generating').length;
  }

  get readyImageAssetsCount(): number {
    return this.flipcardAssets.filter((asset) => asset.imageStatus === 'ready').length;
  }

  get missingAudioAssetsCount(): number {
    return this.flipcardAssets.filter((asset) => asset.audioStatus === 'missing' || asset.audioStatus === 'error').length;
  }

  get queuedAudioAssetsCount(): number {
    return this.flipcardAssets.filter((asset) => asset.audioStatus === 'queued' || asset.audioStatus === 'generating').length;
  }

  get readyAudioAssetsCount(): number {
    return this.flipcardAssets.filter((asset) => asset.audioStatus === 'ready').length;
  }

  get bulkImageGenerationActive(): boolean {
    return this.assetImageBulkEnqueueLoading || Object.values(this.assetImageGenerating).some(Boolean);
  }

  get bulkAudioGenerationActive(): boolean {
    return this.assetAudioBulkEnqueueLoading || Object.values(this.assetAudioGenerating).some(Boolean);
  }

  get currentTranslationBackfillStatus(): FlipcardTranslationBackfillStatusResponse | null {
    return this.translationBackfillStatusByLanguage[this.settingsLanguage];
  }

  get translationBackfillVisible(): boolean {
    return this.settingsLanguage !== 'en';
  }

  get translationBackfillActive(): boolean {
    const status = this.currentTranslationBackfillStatus?.status;
    return this.translationBackfillLoading || status === 'queued' || status === 'generating';
  }

  get translationBackfillSummary(): string {
    const status = this.currentTranslationBackfillStatus;
    if (!status) return 'Stav překladů zatím není načtený.';
    return `Překlady ${status.readyCount} / ${status.totalCount} - ${this.translationBackfillStatusLabel(status.status)}`;
  }

  get translationBackfillProgressPercent(): number {
    const status = this.currentTranslationBackfillStatus;
    if (!status || status.totalCount <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((status.readyCount / status.totalCount) * 100)));
  }

  get translationBackfillUpdatedAtText(): string {
    const updatedAt = this.currentTranslationBackfillStatus?.updatedAt;
    if (!updatedAt) return '';
    const normalized = updatedAt.includes('T') ? updatedAt : updatedAt.replace(' ', 'T');
    const date = new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`);
    if (Number.isNaN(date.getTime())) return updatedAt;
    return date.toLocaleString('cs-CZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  audioPrepItemTypeLabel(item: AudioPrepItem): string {
    if (item.kind === 'flipcard_image') return 'Obrázek';
    if (item.kind === 'spelling') return 'Spelling audio';
    return 'Audio slova';
  }

  audioPrepItemStatusLabel(item: AudioPrepItem): string {
    if (item.status === 'ready') return 'Hotovo';
    if (item.status === 'queued') return 'Ve frontě';
    if (item.status === 'generating') return item.kind === 'flipcard_image' ? 'Generuji' : 'Nahrávám';
    if (item.status === 'error') return 'Chyba';
    return 'Čeká';
  }

  async ngOnInit(): Promise<void> {
    this.installTeslaMp3GestureListeners();
    void this.loadSnapshotNumber();
    await this.loadGameData();
  }

  ngOnDestroy(): void {
    this.cancelAssetLibraryPolling();
    this.cancelAudioPrepPolling();
    this.cancelTranslationBackfillPolling();
    this.clearTimer();
    this.clearFlashTimer();
    this.clearTtsVoiceCheck();
    this.stopBackendAudio();
    this.destroyTeslaMp3Audio();
    this.removeTeslaMp3GestureListeners();
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
      this.setScreen('category');
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
      this.setScreen('mode');
    } catch {
      this.setScreen('login');
    } finally {
      this.loading = false;
      this.render();
    }
  }

  startLanguage(language: LearningLanguage): void {
    this.selectedLanguage = language;
    this.selectedTest = {
      id: -1,
      name: this.languageLabel(language),
      type: 'english',
      questionCount: 0,
    };
    this.loading = true;
    this.resetRoundState();
    this.activeGame = 'spelling';
    this.setScreen('category');
    this.loading = false;
    this.render();
  }

  openSpellingModes(): void {
    this.setScreen('spellingMode');
  }

  async startFlipcards(): Promise<void> {
    this.activeGame = 'flipcards';
    this.resetRoundState();
    this.loading = true;
    this.render();
    try {
      const [stats, settings] = await Promise.all([
        this.apiGet<FlipcardStatsSnapshot>(`flipcards/stats?language=${this.selectedLanguage}`),
        this.apiGet<GameSettings>('settings'),
      ]);
      this.applySettings(settings);
      this.flipcardStats = stats.statsByWord ?? {};
      const [session, answerPool] = await Promise.all([
        this.apiGet<FlipcardSession>(`flipcards/session?language=${this.selectedLanguage}&limit=${this.settings.targetScore}`),
        this.loadFlipcardAnswerPool(),
      ]);
      this.flipcardWords = session.words;
      this.flipcardAnswerPool = answerPool;
      this.flipcardQueue = this.flipcardWords.map((_, index) => index);
      this.flipcardOptionsByIndex = this.flipcardWords.map((_, index) => this.buildFlipcardOptions(index));
      if (this.flipcardWords.length < 1 || this.flipcardAnswerPool.length < 3 || this.flipcardOptionsByIndex.some((options) => options.length < 3)) {
        if (this.settings.flipcardSource === 'ready_only') {
          this.audioPrepItems = [];
          this.audioPrepError = 'Pro ready-only test jsou potřeba aspoň 3 připravená slovíčka.';
          this.setScreen('audioPrep');
        } else {
          this.setScreen('play');
        }
        return;
      }
      await this.prepareFlipcardAssets();
    } catch {
      this.flipcardWords = [];
      this.flipcardAnswerPool = [];
      this.flipcardQueue = [];
      this.flipcardOptionsByIndex = [];
      this.setScreen('play');
      if (this.settings.audioSource === 'browser_tts') {
        this.checkTtsSupport();
      }
    } finally {
      this.loading = false;
      this.render();
    }
  }

  async startSpelling(mode: SpellingSessionMode): Promise<void> {
    this.activeGame = 'spelling';
    this.resetRoundState();
    this.startingSpellingMode = mode;
    this.render();
    try {
      const [stats, settings, session] = await Promise.all([
        this.apiGet<SpellingStatsSnapshot>(`spelling/stats?language=${this.selectedLanguage}`),
        this.apiGet<GameSettings>('settings'),
        this.apiGet<SpellingSession>(`spelling/session?language=${this.selectedLanguage}&mode=${mode}`),
      ]);
      this.applySettings(settings);
      this.spellingStats = stats.statsByWord ?? {};
      this.spellingWords = session.words;
      this.spellingPendingIndices = this.spellingWords.map((_, index) => index);
      if (this.settings.audioSource === 'backend_mp3') {
        await this.prepareBackendAudio();
        return;
      }
      this.startSpellingGame();
    } catch {
      this.spellingWords = [];
      this.spellingPendingIndices = [];
      this.setScreen('play');
      if (this.settings.audioSource === 'browser_tts') {
        this.checkTtsSupport();
      }
    } finally {
      this.startingSpellingMode = null;
      this.render();
    }
  }

  private async loadFlipcardAnswerPool(): Promise<FlipcardWord[]> {
    if (this.settings.flipcardSource === 'ready_only') {
      const response = await this.apiGet<FlipcardAssetsResponse>(`flipcards/assets?language=${this.selectedLanguage}`);
      return response.items
        .filter((asset) => asset.imageStatus === 'ready' && asset.audioStatus === 'ready')
        .map((asset) => ({ text: asset.word, normalized: asset.normalized, conceptKey: asset.conceptKey }));
    }
    const response = await this.apiGet<FlipcardWordsResponse>(`flipcards/words?language=${this.selectedLanguage}`);
    return response.items;
  }

  startPractice(mode: PracticeMode): void {
    this.activeGame = 'multiplication';
    this.selectedMode = mode;
    this.resetRoundState();
    this.setScreen('play');
    this.pickQuestion();
    this.render();
  }

  showAnswer(): void {
    this.revealAnswer();
  }

  replaySpellingAudio(): void {
    this.playCurrentSpellingAudio();
  }

  replaySpellingAnswerAudio(): void {
    this.playCurrentSpellingLettersAudio();
  }

  async retryAudioGeneration(): Promise<void> {
    if (this.activeGame === 'spelling' && this.spellingWords.length > 0) {
      await this.prepareBackendAudio();
      return;
    }
    if (this.activeGame === 'flipcards' && this.flipcardWords.length > 0) {
      await this.prepareFlipcardAssets();
    }
  }

  toggleTtsDetails(): void {
    this.ttsDetailsVisible = !this.ttsDetailsVisible;
  }

  onAudioSourceChange(audioSource: AudioSource): void {
    if (audioSource !== 'backend_mp3') {
      this.destroyTeslaMp3Audio();
    }
  }

  onTeslaMp3AudioEnabledChange(enabled: boolean): void {
    this.teslaMp3AudioEnabled = enabled;
    writeLocalBoolean(TESLA_MP3_AUDIO_STORAGE_KEY, enabled);
    if (!enabled || this.settings.audioSource !== 'backend_mp3') {
      this.destroyTeslaMp3Audio();
    }
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
    this.setScreen('settings');
    this.clearTimer();
    this.ttsDetailsVisible = false;
    this.settingsSaved = false;
    this.settingsError = null;
    this.loading = true;
    this.render();
    try {
      await Promise.all([
        this.loadSettings(),
        this.loadAllLanguageSettings(),
      ]);
    } catch {
      this.settingsError = 'Nastavení se nepodařilo načíst.';
    } finally {
      this.loading = false;
      this.render();
    }
  }

  async openFlipcardAssetLibrary(): Promise<void> {
    this.clearTimer();
    this.ttsDetailsVisible = false;
    this.cancelAssetLibraryPolling();
    const language = this.settingsLanguage;
    this.assetLibraryLanguage = language;
    this.assetLibraryError = null;
    this.assetImageGenerating = {};
    this.assetAudioGenerating = {};
    this.assetImageErrors = {};
    this.assetAudioErrors = {};
    this.assetLibraryLoading = true;
    this.setScreen('assetLibrary');
    this.render();
    try {
      await this.loadFlipcardAssets(language);
      this.startAssetLibraryPolling(language);
    } catch {
      if (this.assetLibraryLanguage === language) {
        this.assetLibraryError = 'Knihovnu se nepodařilo načíst.';
      }
    } finally {
      if (this.assetLibraryLanguage === language) {
        this.assetLibraryLoading = false;
        this.render();
      }
    }
  }

  setAssetLibraryTab(tab: AssetLibraryTab): void {
    this.assetLibraryTab = tab;
  }

  selectSettingsLanguage(language: LearningLanguage): void {
    this.settingsLanguage = language;
    this.translationBackfillError = null;
    if (language !== 'en') {
      void this.loadTranslationBackfillStatus(language);
    }
  }

  async backfillTranslations(): Promise<void> {
    const language = this.settingsLanguage;
    if (language === 'en' || this.translationBackfillActive) return;
    this.translationBackfillLoading = true;
    this.translationBackfillError = null;
    this.render();
    try {
      const status = await this.apiPost<FlipcardTranslationBackfillStatusResponse>(`flipcards/translations/backfill?language=${language}`, {});
      this.applyTranslationBackfillStatus(status);
      if (status.status === 'queued' || status.status === 'generating') {
        this.startTranslationBackfillPolling(language);
      } else if (status.status === 'ready') {
        await this.loadFlipcardWords(language);
      }
    } catch (error) {
      this.translationBackfillError = error instanceof Error ? error.message : 'Překlady se nepodařilo doplnit.';
    } finally {
      this.translationBackfillLoading = false;
      this.render();
    }
  }

  playAssetAudio(asset: FlipcardAsset): void {
    if (!asset.audioUrl) return;
    void this.playBackendAudioUrl(asset.audioUrl);
  }

  assetAudioIsGenerating(asset: FlipcardAsset): boolean {
    return Boolean(this.assetAudioGenerating[asset.normalized])
      || asset.audioStatus === 'queued'
      || asset.audioStatus === 'generating';
  }

  assetAudioError(asset: FlipcardAsset): string | null {
    return this.assetAudioErrors[asset.normalized] ?? asset.audioError ?? null;
  }

  assetAudioStatusLabel(asset: FlipcardAsset): string {
    if (asset.audioStatus === 'ready') return 'Hotovo';
    if (asset.audioStatus === 'queued') return 'Ve frontě';
    if (asset.audioStatus === 'generating') return 'Generuji audio...';
    if (asset.audioStatus === 'error') return 'Chyba';
    return 'Chybí audio';
  }

  assetImageIsGenerating(asset: FlipcardAsset): boolean {
    return Boolean(this.assetImageGenerating[asset.conceptKey])
      || asset.imageStatus === 'queued'
      || asset.imageStatus === 'generating';
  }

  assetImageError(asset: FlipcardAsset): string | null {
    return this.assetImageErrors[asset.conceptKey] ?? asset.imageError ?? null;
  }

  assetImageStatusLabel(asset: FlipcardAsset): string {
    if (asset.imageStatus === 'ready') return 'Hotovo';
    if (asset.imageStatus === 'queued') return 'Ve frontě';
    if (asset.imageStatus === 'generating') return 'Generuji obrázek...';
    if (asset.imageStatus === 'error') return 'Chyba';
    return 'Chybí obrázek';
  }

  async generateAssetImage(asset: FlipcardAsset): Promise<void> {
    if (asset.imageStatus === 'ready' || this.assetImageIsGenerating(asset)) return;
    await this.enqueueAssetImage(asset, false);
  }

  async regenerateAssetImage(asset: FlipcardAsset): Promise<void> {
    if (this.assetImageIsGenerating(asset)) return;
    await this.enqueueAssetImage(asset, true);
  }

  private async enqueueAssetImage(asset: FlipcardAsset, force: boolean): Promise<void> {
    this.assetImageGenerating = { ...this.assetImageGenerating, [asset.conceptKey]: true };
    const { [asset.conceptKey]: _removed, ...nextErrors } = this.assetImageErrors;
    this.assetImageErrors = nextErrors;
    this.render();

    try {
      const response = await this.apiPost<FlipcardImageResponse>(this.flipcardImagePath(asset.conceptKey, force), {});
      if (this.screen !== 'assetLibrary' || this.assetLibraryLanguage !== asset.language) return;
      await this.applyAssetImageResponse(response, asset.conceptKey);
      if (response.status !== 'ready') {
        this.startAssetLibraryPolling(asset.language);
      }
    } catch (error) {
      this.assetImageErrors = {
        ...this.assetImageErrors,
        [asset.conceptKey]: error instanceof Error ? error.message : 'Obrazek se nepodarilo pripravit.',
      };
    } finally {
      const { [asset.conceptKey]: _removed, ...nextGenerating } = this.assetImageGenerating;
      this.assetImageGenerating = nextGenerating;
      this.render();
    }
  }

  async generateAssetAudio(asset: FlipcardAsset): Promise<void> {
    if (asset.audioStatus === 'ready' || this.assetAudioIsGenerating(asset)) return;
    this.assetAudioGenerating = { ...this.assetAudioGenerating, [asset.normalized]: true };
    const { [asset.normalized]: _removed, ...nextErrors } = this.assetAudioErrors;
    this.assetAudioErrors = nextErrors;
    this.render();

    try {
      const response = await this.apiPost<SpellingAudioWordResponse>(this.flipcardAudioPath(asset.word, asset.language), {});
      if (this.screen !== 'assetLibrary' || this.assetLibraryLanguage !== asset.language) return;
      this.applyAssetAudioResponse(response);
      if (response.status !== 'ready') {
        this.startAssetLibraryPolling(asset.language);
      }
    } catch (error) {
      this.assetAudioErrors = {
        ...this.assetAudioErrors,
        [asset.normalized]: error instanceof Error ? error.message : 'Audio se nepodarilo pripravit.',
      };
    } finally {
      const { [asset.normalized]: _removed, ...nextGenerating } = this.assetAudioGenerating;
      this.assetAudioGenerating = nextGenerating;
      this.render();
    }
  }

  async generateAllMissingAssetImages(): Promise<void> {
    if (this.assetImageBulkEnqueueLoading) return;
    const language = this.assetLibraryLanguage;
    this.assetImageBulkEnqueueLoading = true;
    this.assetLibraryError = null;
    this.render();
    try {
      await this.apiPost<FlipcardAssetBulkEnqueueResponse>(`flipcards/images/missing?language=${language}`, {});
      await this.loadFlipcardAssets(language);
      this.startAssetLibraryPolling(language);
    } catch (error) {
      if (this.assetLibraryLanguage === language) {
        this.assetLibraryError = error instanceof Error ? error.message : 'Obrázky se nepodařilo přidat do fronty.';
      }
    } finally {
      this.assetImageBulkEnqueueLoading = false;
      this.render();
    }
  }

  async generateAllMissingAssetAudio(): Promise<void> {
    if (this.assetAudioBulkEnqueueLoading) return;
    const language = this.assetLibraryLanguage;
    this.assetAudioBulkEnqueueLoading = true;
    this.assetLibraryError = null;
    this.render();
    try {
      await this.apiPost<FlipcardAssetBulkEnqueueResponse>(`flipcards/audio/missing?language=${language}`, {});
      await this.loadFlipcardAssets(language);
      this.startAssetLibraryPolling(language);
    } catch (error) {
      if (this.assetLibraryLanguage === language) {
        this.assetLibraryError = error instanceof Error ? error.message : 'Audio se nepodařilo přidat do fronty.';
      }
    } finally {
      this.assetAudioBulkEnqueueLoading = false;
      this.render();
    }
  }

  private async applyAssetImageResponse(response: FlipcardImageResponse, conceptKey: string = response.normalized): Promise<void> {
    let nextImageUrl = response.imageUrl;
    const previousImageUrl = this.flipcardAssets.find((item) => item.conceptKey === conceptKey)?.imageUrl ?? null;
    if (response.status === 'ready' && response.imageUrl) {
      nextImageUrl = this.sameImageAssetUrl(response.imageUrl, previousImageUrl)
        ? this.withCacheBust(response.imageUrl)
        : response.imageUrl;
      await this.preloadImage(nextImageUrl);
      this.flipcardImageUrls = {
        ...this.flipcardImageUrls,
        [response.normalized]: nextImageUrl,
      };
    }
    this.flipcardAssets = this.flipcardAssets.map((item) => (
      item.conceptKey === conceptKey
        ? {
          ...item,
          imageStatus: response.status,
          imageUrl: nextImageUrl ?? item.imageUrl,
          imageError: response.error ?? null,
        }
        : item
    ));
    this.render();
  }

  private applyAssetAudioResponse(response: SpellingAudioWordResponse): void {
    this.flipcardAssets = this.flipcardAssets.map((item) => (
      item.normalized === response.normalized
        ? {
          ...item,
          audioStatus: response.status,
          audioUrl: response.audioUrl ?? item.audioUrl,
          audioError: response.error ?? null,
        }
        : item
    ));
    this.render();
  }

  private startAssetLibraryPolling(language: LearningLanguage = this.assetLibraryLanguage): void {
    if (this.screen !== 'assetLibrary' || this.assetLibraryLanguage !== language) return;
    const hasActiveJobs = this.flipcardAssets.some((asset) => (
      asset.language === language
      && (
        asset.imageStatus === 'queued'
        || asset.imageStatus === 'generating'
        || asset.audioStatus === 'queued'
        || asset.audioStatus === 'generating'
      )
    ));
    if (!hasActiveJobs) return;
    if (this.assetLibraryPollToken) {
      if (this.assetLibraryPollToken.language === language) return;
      this.cancelAssetLibraryPolling();
    }

    const token: AssetLibraryPollToken = { cancelled: false, language };
    this.assetLibraryPollToken = token;
    void this.pollAssetLibrary(token);
  }

  private cancelAssetLibraryPolling(): void {
    if (this.assetLibraryPollToken) {
      this.assetLibraryPollToken.cancelled = true;
      this.assetLibraryPollToken = null;
    }
  }

  private cancelAudioPrepPolling(): void {
    if (this.audioPrepPollToken) {
      this.audioPrepPollToken.cancelled = true;
      this.audioPrepPollToken = null;
    }
  }

  private cancelTranslationBackfillPolling(): void {
    Object.values(this.translationBackfillPollTokens).forEach((token) => {
      if (token) token.cancelled = true;
    });
    this.translationBackfillPollTokens = {};
  }

  private async pollAssetLibrary(token: AssetLibraryPollToken): Promise<void> {
    while (!token.cancelled && this.screen === 'assetLibrary' && this.assetLibraryLanguage === token.language) {
      await this.delay(2000);
      if (token.cancelled || this.screen !== 'assetLibrary' || this.assetLibraryLanguage !== token.language) break;
      const activeAssets = this.flipcardAssets.filter((asset) => (
        asset.language === token.language
        && (
          asset.imageStatus === 'queued'
          || asset.imageStatus === 'generating'
          || asset.audioStatus === 'queued'
          || asset.audioStatus === 'generating'
        )
      ));
      if (activeAssets.length === 0) break;

      try {
        await Promise.all(activeAssets.map((asset) => this.refreshAssetLibraryItem(asset, token)));
      } catch {
        if (!token.cancelled && this.screen === 'assetLibrary' && this.assetLibraryLanguage === token.language) {
          this.assetLibraryError = 'Stav knihovny se nepodařilo obnovit.';
          this.render();
        }
      }
    }
    if (this.assetLibraryPollToken === token) {
      this.assetLibraryPollToken = null;
    }
  }

  private async refreshAssetLibraryItem(asset: FlipcardAsset, token: AssetLibraryPollToken): Promise<void> {
    if (asset.language !== token.language) return;
    const needsImage = asset.imageStatus === 'queued' || asset.imageStatus === 'generating';
    const needsAudio = asset.audioStatus === 'queued' || asset.audioStatus === 'generating';
    await Promise.all([
      needsImage ? this.apiGet<FlipcardImageResponse>(this.flipcardImagePath(asset.conceptKey)) : Promise.resolve(null),
      needsAudio ? this.apiGet<SpellingAudioWordResponse>(this.flipcardAudioPath(asset.word, token.language)) : Promise.resolve(null),
    ]).then(async ([imageResponse, audioResponse]) => {
      if (token.cancelled || this.screen !== 'assetLibrary' || this.assetLibraryLanguage !== token.language) return;
      if (imageResponse) {
        await this.applyAssetImageResponse(imageResponse, asset.conceptKey);
        if (imageResponse.status === 'ready' || imageResponse.status === 'error') {
          const { [imageResponse.normalized]: _removed, ...nextGenerating } = this.assetImageGenerating;
          this.assetImageGenerating = nextGenerating;
        }
      }
      if (audioResponse) {
        this.applyAssetAudioResponse(audioResponse);
        if (audioResponse.status === 'ready' || audioResponse.status === 'error') {
          const { [audioResponse.normalized]: _removed, ...nextGenerating } = this.assetAudioGenerating;
          this.assetAudioGenerating = nextGenerating;
        }
      }
    });
  }

  async saveSettingsOnly(): Promise<void> {
    this.settingsSaved = false;
    this.settingsError = null;
    this.loading = true;
    try {
      const [savedSettings] = await Promise.all([
        this.apiPut<GameSettings>('settings', this.normalizedSettings()),
        ...this.languageOptions.map((language) => this.apiPut<SpellingSet[]>(`spelling/sets?language=${language.code}`, {
          sets: this.spellingSetInputsByLanguage[language.code],
          latestSetIndex: this.latestSpellingSetIndexByLanguage[language.code],
        })),
        ...this.languageOptions.map((language) => this.apiPut<FlipcardWordsResponse>(`flipcards/words?language=${language.code}`, {
          words: this.flipcardWordInputByLanguage[language.code],
        })),
      ]);
      this.applySettings(savedSettings);
      await this.loadAllLanguageSettings();
      this.settingsSaved = true;
    } catch {
      this.settingsError = 'Nastavení se nepodařilo uložit.';
    } finally {
      this.loading = false;
      this.render();
    }
  }

  addSpellingSet(): void {
    const inputs = [...this.spellingSetInputsByLanguage[this.settingsLanguage], ''];
    this.spellingSetInputsByLanguage = { ...this.spellingSetInputsByLanguage, [this.settingsLanguage]: inputs };
    this.latestSpellingSetIndexByLanguage = { ...this.latestSpellingSetIndexByLanguage, [this.settingsLanguage]: inputs.length - 1 };
  }

  removeSpellingSet(index: number): void {
    let inputs = this.spellingSetInputsByLanguage[this.settingsLanguage].filter((_, candidateIndex) => candidateIndex !== index);
    if (inputs.length === 0) {
      inputs = [''];
    }
    let latestIndex = this.latestSpellingSetIndexByLanguage[this.settingsLanguage];
    if (latestIndex === index) {
      latestIndex = this.lastConfiguredSpellingSetIndex();
    } else if (latestIndex > index) {
      latestIndex -= 1;
    }
    this.spellingSetInputsByLanguage = { ...this.spellingSetInputsByLanguage, [this.settingsLanguage]: inputs };
    this.latestSpellingSetIndexByLanguage = {
      ...this.latestSpellingSetIndexByLanguage,
      [this.settingsLanguage]: Math.min(latestIndex, inputs.length - 1),
    };
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
    this.flipcardWords = [];
    this.flipcardAnswerPool = [];
    this.flipcardQueue = [];
    this.flipcardWordIndex = null;
    this.flipcardOptions = [];
    this.flipcardOptionsByIndex = [];
    this.flipcardImageLoaded = false;
    this.flipcardImageError = null;
    this.spellingPendingIndices = [];
    this.startingSpellingMode = null;
    this.spellingStats = {};
    this.flipcardStats = {};
    this.audioPrepItems = [];
    this.audioPrepError = null;
    this.backendAudioUrls = {};
    this.backendSpellingAudioUrls = {};
    this.flipcardImageUrls = {};
    this.flipcardAdvancing = false;
    this.clearFlipcardPreloads();
    this.setScreen(this.tests.length > 0 ? 'start' : 'settings');
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
        this.flipcardWords = [];
        this.flipcardQueue = [];
        this.spellingPendingIndices = [];
        this.startingSpellingMode = null;
        this.spellingStats = {};
        this.flipcardStats = {};
        this.setScreen('login');
        return;
      }
      const [tests, settings] = await Promise.all([
        this.apiGet<QuizTest[]>('tests'),
        this.apiGet<GameSettings>('settings'),
        this.loadAllLanguageSettings(),
      ]);
      this.applySettings(settings);
      this.tests = tests;
      this.selectedTest = null;
      this.selectedMode = null;
      this.questions = [];
      this.serverStats = emptyStatsByDirection();
      this.spellingWords = [];
      this.flipcardWords = [];
      this.flipcardQueue = [];
      this.spellingPendingIndices = [];
      this.startingSpellingMode = null;
      this.spellingStats = {};
      this.flipcardStats = {};
      this.setScreen(this.tests.length > 0 ? 'start' : 'settings');
    } catch {
      this.setScreen('login');
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private async loadSettings(): Promise<void> {
    this.applySettings(await this.apiGet<GameSettings>('settings'));
  }

  private async loadSnapshotNumber(): Promise<void> {
    try {
      const response = await fetch(`/snapshot.txt?_=${Date.now()}`, { cache: 'no-store' });
      const snapshot = (await response.text()).trim();
      if (response.ok && snapshot) {
        this.snapshotNumber = snapshot;
        this.render();
      }
    } catch {
      this.snapshotNumber = 'dev';
    }
  }

  private normalizedSettings(): GameSettings {
    return {
      secondsLimit: Math.max(1, Math.floor(Number(this.settings.secondsLimit) || 10)),
      targetScore: Math.max(1, Math.floor(Number(this.settings.targetScore) || 10)),
      audioSource: this.settings.audioSource === 'backend_mp3' ? 'backend_mp3' : 'browser_tts',
      flipcardSource: this.settings.flipcardSource === 'ready_only' ? 'ready_only' : 'all_words',
    };
  }

  private applySettings(settings: GameSettings): void {
    const wasTeslaMp3AudioModeActive = this.teslaMp3AudioModeActive;
    this.settings = {
      secondsLimit: Math.max(1, Math.floor(Number(settings.secondsLimit) || 30)),
      targetScore: Math.max(1, Math.floor(Number(settings.targetScore) || 10)),
      audioSource: settings.audioSource === 'backend_mp3' ? 'backend_mp3' : 'browser_tts',
      flipcardSource: settings.flipcardSource === 'ready_only' ? 'ready_only' : 'all_words',
    };
    this.secondsLeft = this.settings.secondsLimit;
    if (wasTeslaMp3AudioModeActive && !this.teslaMp3AudioModeActive) {
      this.destroyTeslaMp3Audio();
    }
  }

  private startSpellingGame(): void {
    this.setScreen('play');
    if (this.settings.audioSource === 'browser_tts') {
      this.checkTtsSupport();
    } else {
      this.ttsDetailsVisible = false;
    }
    this.pickQuestion();
  }

  private startFlipcardGame(): void {
    this.setScreen('play');
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
          word: formatSpellingAnswer(word.text, this.selectedLanguage),
          kind: 'spelling' as const,
          status: 'pending' as const,
          audioUrl: null,
          error: null,
        },
      ]);

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

      const missingItems = this.audioPrepItems.filter((item) => item.status !== 'ready');
      if (missingItems.length > 0) {
        this.setScreen('audioPrep');
        this.render();
      }
      await this.generateMissingAudio(missingItems);
      if (this.audioPrepItems.some((item) => item.status === 'error')) return;
      this.audioPrepLoading = false;
      this.startSpellingGame();
    } catch (error) {
      this.setScreen('audioPrep');
      this.audioPrepError = error instanceof Error ? error.message : 'Audio se nepodařilo připravit.';
    } finally {
      this.audioPrepLoading = false;
      this.render();
    }
  }

  private async prepareFlipcardAssets(): Promise<void> {
    this.audioPrepLoading = true;
    this.audioPrepError = null;
    this.backendAudioUrls = {};
    this.flipcardImageUrls = {};
    try {
      const imageItems: AudioPrepItem[] = this.flipcardWords.map((word) => ({
            audioWord: word.conceptKey,
            normalized: word.conceptKey,
            word: word.text,
            kind: 'flipcard_image',
            status: 'pending',
            audioUrl: null,
            error: null,
      }));
      const audioItems: AudioPrepItem[] = this.settings.audioSource === 'backend_mp3'
        ? this.flipcardAudioWordsForSession().map((word) => ({
            audioWord: word.text,
            normalized: word.normalized,
            word: word.text,
            kind: 'word',
            status: 'pending',
            audioUrl: null,
            error: null,
        }))
        : [];
      this.audioPrepItems = [...imageItems, ...audioItems];

      await Promise.all(this.audioPrepItems.map((item) => (
        item.kind === 'flipcard_image' ? this.loadFlipcardImageStatus(item) : this.loadAudioItemStatus(item)
      )));
      this.flipcardImageUrls = Object.fromEntries(
        this.audioPrepItems
          .filter((item) => item.kind === 'flipcard_image' && item.audioUrl)
          .map((item) => [item.normalized, item.audioUrl as string]),
      );
      this.backendAudioUrls = Object.fromEntries(
        this.audioPrepItems
          .filter((item) => item.kind === 'word' && item.audioUrl)
          .map((item) => [item.normalized, item.audioUrl as string]),
      );

      const missingItems = this.audioPrepItems.filter((item) => item.status !== 'ready');
      if (this.settings.flipcardSource === 'ready_only' && missingItems.length > 0) {
        this.setScreen('audioPrep');
        this.audioPrepError = 'Pro test z připravených slov chybí obrázek nebo audio.';
        this.render();
        return;
      }
      if (missingItems.length > 0) {
        this.setScreen('audioPrep');
        this.render();
      }
      await this.generateMissingAudio(missingItems);
      if (this.audioPrepItems.some((item) => item.status === 'error')) return;
      await this.preloadFlipcardImages();
      this.audioPrepLoading = false;
      this.startFlipcardGame();
    } catch (error) {
      this.setScreen('audioPrep');
      this.audioPrepError = error instanceof Error ? error.message : 'Obrázky se nepodařilo připravit.';
    } finally {
      this.audioPrepLoading = false;
      this.render();
    }
  }

  private async loadAudioItemStatus(item: AudioPrepItem): Promise<void> {
    if (item.kind === 'flipcard_image') return;
    const response = await this.apiGet<SpellingAudioWordResponse>(this.audioStatusPath(item.audioWord, item.kind));
    if (response.status !== 'ready' || !response.audioUrl) {
      if (response.status !== 'missing') {
        this.updateAudioPrepItem(item.normalized, item.kind, {
          status: response.status,
          error: response.error ?? null,
        });
      }
      return;
    }
    this.updateAudioPrepItem(item.normalized, item.kind, {
      status: 'ready',
      audioUrl: response.audioUrl,
      error: null,
    });
  }

  private async loadFlipcardImageStatus(item: AudioPrepItem): Promise<void> {
    const response = await this.apiGet<FlipcardImageResponse>(this.flipcardImagePath(item.audioWord));
    if (response.status !== 'ready' || !response.imageUrl) {
      if (response.status !== 'missing') {
        this.updateAudioPrepItem(item.normalized, item.kind, {
          status: response.status,
          error: response.error ?? null,
        });
      }
      return;
    }
    this.updateAudioPrepItem(item.normalized, item.kind, {
      status: 'ready',
      audioUrl: response.imageUrl,
      error: null,
    });
  }

  private async preloadFlipcardImages(): Promise<void> {
    const urls = this.flipcardWords
      .map((word) => this.flipcardImageUrls[word.conceptKey])
      .filter((url): url is string => Boolean(url));
    await Promise.allSettled(urls.map((url) => this.preloadImage(url)));
  }

  private async preloadImage(url: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('Obrázek se nepodařilo načíst včas.'));
      }, 15000);
      const cleanup = () => {
        window.clearTimeout(timeout);
        image.onload = null;
        image.onerror = null;
      };
      image.onload = async () => {
        try {
          if (image.decode) {
            await Promise.race([
              image.decode(),
              new Promise<void>((decodeResolve) => window.setTimeout(decodeResolve, 3000)),
            ]);
          }
        } finally {
          cleanup();
          resolve();
        }
      };
      image.onerror = () => {
        cleanup();
        reject(new Error('Obrázek se nepodařilo načíst.'));
      };
      image.decoding = 'async';
      image.src = url;
      if (image.complete && image.naturalWidth > 0) {
        image.onload(new Event('load'));
      }
    });
  }

  private async generateMissingAudio(items: AudioPrepItem[]): Promise<void> {
    this.cancelAudioPrepPolling();
    const token: PollToken = { cancelled: false };
    this.audioPrepPollToken = token;
    const queue = [...items];
    const workers = Array.from({ length: Math.min(2, queue.length) }, async () => {
      while (queue.length > 0 && !token.cancelled) {
        const item = queue.shift();
        if (!item) return;
        await this.generateAudioItem(item, token);
      }
    });
    try {
      await Promise.all(workers);
    } finally {
      if (this.audioPrepPollToken === token) {
        this.audioPrepPollToken = null;
      }
    }
  }

  private async generateAudioItem(item: AudioPrepItem, token: PollToken): Promise<void> {
    if (token.cancelled) return;
    this.updateAudioPrepItem(item.normalized, item.kind, { status: 'queued', error: null });
    try {
      if (item.kind === 'flipcard_image') {
        const response = await this.apiPost<FlipcardImageResponse>(this.flipcardImagePath(item.audioWord), {});
        if (token.cancelled) return;
        this.applyFlipcardImagePrepResponse(item, response);
        if (response.status !== 'ready') {
          await this.pollAudioPrepItemUntilReady(item, token);
        }
        return;
      }
      const response = await this.apiPost<SpellingAudioWordResponse>(this.audioStatusPath(item.audioWord, item.kind), {});
      if (token.cancelled) return;
      this.applySpellingAudioPrepResponse(item, response);
      if (response.status !== 'ready') {
        await this.pollAudioPrepItemUntilReady(item, token);
      }
    } catch (error) {
      if (token.cancelled) return;
      this.audioPrepError = error instanceof Error ? error.message : 'Generování selhalo.';
      this.updateAudioPrepItem(item.normalized, item.kind, {
        status: 'error',
        error: this.audioPrepError,
      });
    }
  }

  private async pollAudioPrepItemUntilReady(item: AudioPrepItem, token: PollToken): Promise<void> {
    const startedAt = Date.now();
    while (!token.cancelled && Date.now() - startedAt < 30 * 60 * 1000) {
      await this.delay(2000);
      if (token.cancelled) return;
      if (item.kind === 'flipcard_image') {
        const response = await this.apiGet<FlipcardImageResponse>(this.flipcardImagePath(item.audioWord));
        if (token.cancelled) return;
        this.applyFlipcardImagePrepResponse(item, response);
        if (response.status === 'ready') return;
        if (response.status === 'error') throw new Error(response.error ?? 'Generování obrázku selhalo.');
      } else {
        const response = await this.apiGet<SpellingAudioWordResponse>(this.audioStatusPath(item.audioWord, item.kind));
        if (token.cancelled) return;
        this.applySpellingAudioPrepResponse(item, response);
        if (response.status === 'ready') return;
        if (response.status === 'error') throw new Error(response.error ?? 'Generování audia selhalo.');
      }
    }
    if (token.cancelled) return;
    throw new Error('Generování trvá příliš dlouho.');
  }

  private applyFlipcardImagePrepResponse(item: AudioPrepItem, response: FlipcardImageResponse): void {
    if (response.status === 'ready' && response.imageUrl) {
      this.flipcardImageUrls = {
        ...this.flipcardImageUrls,
        [response.normalized]: response.imageUrl,
      };
      this.updateAudioPrepItem(item.normalized, item.kind, { status: 'ready', audioUrl: response.imageUrl, error: null });
      return;
    }
    this.updateAudioPrepItem(item.normalized, item.kind, {
      status: response.status,
      error: response.error ?? null,
    });
  }

  private applySpellingAudioPrepResponse(item: AudioPrepItem, response: SpellingAudioWordResponse): void {
    if (response.status === 'ready' && response.audioUrl) {
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
      return;
    }
    this.updateAudioPrepItem(item.normalized, item.kind, {
      status: response.status,
      error: response.error ?? null,
    });
  }

  private updateAudioPrepItem(normalized: string, kind: AudioPrepItem['kind'], update: Partial<AudioPrepItem>): void {
    this.audioPrepItems = this.audioPrepItems.map((item) => (
      item.normalized === normalized && item.kind === kind ? { ...item, ...update } : item
    ));
    this.render();
  }

  private spellingAudioPath(word: string, kind: 'word' | 'spelling'): string {
    return `spelling/audio/words/${encodeURIComponent(word)}?language=${this.selectedLanguage}&kind=${kind}`;
  }

  private flipcardAudioPath(word: string, language: LearningLanguage = this.selectedLanguage): string {
    return `flipcards/audio/${language}/${encodeURIComponent(word)}`;
  }

  private audioStatusPath(word: string, kind: 'word' | 'spelling'): string {
    return this.activeGame === 'flipcards' && kind === 'word'
      ? this.flipcardAudioPath(word)
      : this.spellingAudioPath(word, kind);
  }

  private flipcardImagePath(word: string, force = false): string {
    const suffix = force ? '?force=true' : '';
    return `flipcards/images/${encodeURIComponent(word)}${suffix}`;
  }

  private withCacheBust(url: string): string {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}refresh=${Date.now()}`;
  }

  private sameImageAssetUrl(url: string, otherUrl: string | null): boolean {
    if (!otherUrl) return false;
    return this.withoutRefreshParam(url) === this.withoutRefreshParam(otherUrl);
  }

  private withoutRefreshParam(url: string): string {
    const [path, query] = url.split('?');
    if (!query) return url;
    const params = query
      .split('&')
      .filter((part) => !part.startsWith('refresh='));
    return params.length > 0 ? `${path}?${params.join('&')}` : path;
  }

  private languageLabel(language: LearningLanguage): string {
    return this.languageOptions.find((option) => option.code === language)?.label ?? 'Angličtina';
  }

  private translationBackfillStatusLabel(status: ArtifactStatus): string {
    if (status === 'ready') return 'hotovo';
    if (status === 'queued') return 've frontě';
    if (status === 'generating') return 'doplňuji';
    if (status === 'error') return 'chyba';
    return 'chybí';
  }

  private ttsLanguage(): string {
    return this.languageOptions.find((option) => option.code === this.selectedLanguage)?.ttsLang ?? 'en-US';
  }

  private async delay(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
  }

  private setScreen(screen: Screen): void {
    if (this.screen === 'assetLibrary' && screen !== 'assetLibrary') {
      this.cancelAssetLibraryPolling();
    }
    if (this.screen === 'audioPrep' && screen !== 'audioPrep') {
      this.cancelAudioPrepPolling();
    }
    if (this.screen === 'settings' && screen !== 'settings') {
      this.cancelTranslationBackfillPolling();
    }
    this.screen = screen;
  }

  private pickQuestion(): void {
    this.clearTimer();
    if (this.activeGame === 'spelling') {
      this.pickSpellingWord();
      return;
    }
    if (this.activeGame === 'flipcards') {
      this.pickFlipcardWord();
      return;
    }
    if (this.questions.length === 0) {
      this.currentIndex = null;
      this.setScreen(this.selectedTest ? 'mode' : 'start');
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
      this.setScreen('finished');
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

  private pickFlipcardWord(): void {
    if (this.flipcardWords.length < 3) {
      this.flipcardWordIndex = null;
      return;
    }
    const nextIndex = this.flipcardQueue[0];
    if (nextIndex === undefined) {
      this.clearTimer();
      this.surprise = surprises[Math.floor(Math.random() * surprises.length)] ?? surprises[0];
      this.setScreen('finished');
      return;
    }
    this.flipcardWordIndex = nextIndex;
    this.flipcardAttemptFailed = false;
    this.flipcardImageLoaded = false;
    this.flipcardImageError = null;
    this.flipcardOptions = this.flipcardOptionsForIndex(nextIndex);
    this.answerVisible = false;
    this.timedOut = false;
    this.secondsLeft = this.settings.secondsLimit;
    this.render();
    this.preloadAdjacentFlipcardAssets();
  }

  private buildFlipcardOptions(index: number): FlipcardOption[] {
    const correct = this.flipcardWords[index];
    if (!correct) return [];
    const distractors = shuffled(
      this.flipcardAnswerPool.filter((word) => word.normalized !== correct.normalized),
    ).slice(0, 2);
    return shuffled([correct, ...distractors]).map((word) => ({ word, disabled: false }));
  }

  private flipcardOptionsForIndex(index: number): FlipcardOption[] {
    return (this.flipcardOptionsByIndex[index] ?? this.buildFlipcardOptions(index))
      .map((option) => ({ word: option.word, disabled: false, wrongFeedback: false }));
  }

  private flipcardAudioWordsForSession(): FlipcardWord[] {
    const words = new Map<string, FlipcardWord>();
    this.flipcardOptionsByIndex.flat().forEach((option) => {
      words.set(option.word.normalized, option.word);
    });
    return Array.from(words.values());
  }

  async selectFlipcardOption(option: FlipcardOption): Promise<void> {
    const current = this.currentFlipcardWord;
    const currentIndex = this.flipcardWordIndex;
    if (!current || currentIndex === null || option.disabled || this.flipcardAnswersDisabled) return;
    this.flipcardAdvancing = true;
    this.render();
    if (option.word.normalized !== current.normalized) {
      this.disableFlipcardOption(option.word.normalized);
      await this.playFlipcardWordAudio(option.word);
      this.flipcardAdvancing = false;
      if (!this.flipcardAttemptFailed) {
        this.flipcardAttemptFailed = true;
        void this.recordFlipcardAnswer(currentIndex, false, false);
      }
      this.render();
      return;
    }

    await this.playFlipcardWordAudio(option.word);
    this.flipcardQueue = this.flipcardQueue.filter((index) => index !== currentIndex);
    if (this.flipcardAttemptFailed) {
      this.flipcardQueue = [...this.flipcardQueue, currentIndex];
    } else {
      this.score += 1;
      void this.recordFlipcardAnswer(currentIndex, true, false);
    }
    this.flipcardAdvancing = false;
    this.pickQuestion();
  }

  private disableFlipcardOption(normalized: string): void {
    this.flipcardOptions = this.flipcardOptions.map((option) => (
      option.word.normalized === normalized ? { ...option, disabled: true, wrongFeedback: true } : option
    ));
    this.render();
    window.setTimeout(() => {
      this.flipcardOptions = this.flipcardOptions.map((option) => (
        option.word.normalized === normalized ? { ...option, wrongFeedback: false } : option
      ));
      this.render();
    }, 460);
  }

  onFlipcardImageLoad(): void {
    if (this.activeGame !== 'flipcards' || this.flipcardWordIndex === null) return;
    this.flipcardImageLoaded = true;
    this.flipcardImageError = null;
    this.startTimer();
    this.render();
  }

  onFlipcardImageError(): void {
    this.clearTimer();
    this.flipcardImageLoaded = false;
    this.flipcardImageError = 'Obrázek se nepodařilo načíst.';
    this.render();
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
      const hasCurrentItem = this.activeGame === 'spelling'
        ? this.spellingWordIndex !== null
        : this.activeGame === 'flipcards'
          ? this.flipcardWordIndex !== null
          : this.currentIndex !== null;
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
    const index = this.activeGame === 'spelling'
      ? this.spellingWordIndex
      : this.activeGame === 'flipcards'
        ? this.flipcardWordIndex
        : this.currentIndex;
    if (index === null || this.answerVisible) return;
    this.clearTimer();
    if (this.activeGame === 'flipcards') {
      void this.handleFlipcardTimeout(index);
      return;
    }
    this.timedOut = true;
    this.revealAnswer();
    this.score -= 1;
    this.incrementMistakeWeight(index);
    void this.recordAnswer(index, false, true);
    this.showPenalty();
    this.render();
  }

  private async handleFlipcardTimeout(index: number): Promise<void> {
    this.timedOut = true;
    this.flipcardAdvancing = true;
    this.score -= 1;
    void this.recordFlipcardAnswer(index, false, true);
    this.flipcardQueue = this.flipcardQueue.filter((candidate) => candidate !== index);
    this.flipcardQueue = [...this.flipcardQueue, index];
    this.showPenalty();
    this.render();
    await this.playFlipcardWordAudio(this.flipcardWords[index]);
    this.flipcardAdvancing = false;
    this.pickQuestion();
  }

  private revealAnswer(): void {
    this.answerVisible = true;
    this.clearTimer();
    if (this.activeGame === 'spelling') {
      window.setTimeout(() => this.playCurrentSpellingLettersAudio(), 120);
    }
  }

  private finishIfNeeded(nextScore: number): boolean {
    if (this.activeGame === 'spelling') return false;
    if (nextScore < this.settings.targetScore) return false;
    this.clearTimer();
    this.surprise = surprises[Math.floor(Math.random() * surprises.length)] ?? surprises[0];
    this.setScreen('finished');
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
    const response = await this.apiPost<SpellingAnswerResultResponse>(`spelling/stats/answer?language=${this.selectedLanguage}`, {
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

  private async recordFlipcardAnswer(index: number, correct: boolean, timedOut: boolean): Promise<void> {
    const word = this.flipcardWords[index];
    if (!word) return;
    const response = await this.apiPost<FlipcardAnswerResultResponse>(`flipcards/stats/answer?language=${this.selectedLanguage}`, {
      word: word.normalized,
      correct,
      timedOut,
    });
    this.flipcardStats = {
      ...this.flipcardStats,
      [response.word]: response.stats,
    };
    this.render();
  }

  private resetRoundState(): void {
    this.cancelAssetLibraryPolling();
    this.cancelAudioPrepPolling();
    this.clearTimer();
    this.stopBackendAudio();
    this.score = 0;
    this.currentIndex = null;
    this.spellingWordIndex = null;
    this.flipcardWordIndex = null;
    this.flipcardQueue = [];
    this.flipcardOptions = [];
    this.flipcardOptionsByIndex = [];
    this.flipcardAnswerPool = [];
    this.flipcardAttemptFailed = false;
    this.flipcardImageLoaded = false;
    this.flipcardImageError = null;
    this.startingSpellingMode = null;
    this.currentDirection = 'product_to_factors';
    this.currentFactorQuestion = null;
    this.spellingPendingIndices = [];
    this.audioPrepItems = [];
    this.audioPrepError = null;
    this.audioPrepLoading = false;
    this.backendAudioUrls = {};
    this.backendSpellingAudioUrls = {};
    this.flipcardImageUrls = {};
    this.flipcardAdvancing = false;
    this.clearFlipcardPreloads();
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

  private async loadAllLanguageSettings(): Promise<void> {
    await Promise.all(this.languageOptions.flatMap((language) => [
      this.loadSpellingSets(language.code),
      this.loadFlipcardWords(language.code),
      language.code === 'en' ? Promise.resolve() : this.loadTranslationBackfillStatus(language.code),
    ]));
  }

  private async loadTranslationBackfillStatus(language: LearningLanguage): Promise<void> {
    const status = await this.apiGet<FlipcardTranslationBackfillStatusResponse>(`flipcards/translations/status?language=${language}`);
    this.applyTranslationBackfillStatus(status);
    if (status.status === 'queued' || status.status === 'generating') {
      this.startTranslationBackfillPolling(language);
    }
  }

  private applyTranslationBackfillStatus(status: FlipcardTranslationBackfillStatusResponse): void {
    this.translationBackfillStatusByLanguage = {
      ...this.translationBackfillStatusByLanguage,
      [status.language]: status,
    };
  }

  private startTranslationBackfillPolling(language: LearningLanguage): void {
    if (this.translationBackfillPollTokens[language]) return;
    const token: PollToken = { cancelled: false };
    this.translationBackfillPollTokens = {
      ...this.translationBackfillPollTokens,
      [language]: token,
    };
    void this.pollTranslationBackfill(language, token);
  }

  private async pollTranslationBackfill(language: LearningLanguage, token: PollToken): Promise<void> {
    while (!token.cancelled) {
      await this.delay(2500);
      if (token.cancelled) break;
      try {
        const status = await this.apiGet<FlipcardTranslationBackfillStatusResponse>(`flipcards/translations/status?language=${language}`);
        if (token.cancelled) break;
        this.applyTranslationBackfillStatus(status);
        if (status.status === 'ready') {
          await this.loadFlipcardWords(language);
          if (this.screen === 'assetLibrary' && this.assetLibraryLanguage === language) {
            await this.loadFlipcardAssets(language);
          }
          this.render();
          break;
        }
        if (status.status === 'error') {
          this.translationBackfillError = status.error ?? 'Doplnění překladů selhalo.';
          this.render();
          break;
        }
      } catch {
        if (!token.cancelled) {
          this.translationBackfillError = 'Stav překladů se nepodařilo obnovit.';
          this.render();
        }
        break;
      }
    }
    if (this.translationBackfillPollTokens[language] === token) {
      const { [language]: _finished, ...remainingTokens } = this.translationBackfillPollTokens;
      this.translationBackfillPollTokens = remainingTokens;
    }
  }

  private async loadSpellingSets(language: LearningLanguage = this.settingsLanguage): Promise<void> {
    const sets = await this.apiGet<SpellingSet[]>(`spelling/sets?language=${language}`);
    this.spellingSetInputsByLanguage = {
      ...this.spellingSetInputsByLanguage,
      [language]: sets.length > 0 ? sets.map((set) => set.rawWords) : [''],
    };
    const latestIndex = sets.findIndex((set) => set.isLatest);
    this.latestSpellingSetIndexByLanguage = {
      ...this.latestSpellingSetIndexByLanguage,
      [language]: latestIndex >= 0 ? latestIndex : this.lastConfiguredSpellingSetIndex(language),
    };
  }

  private async loadFlipcardWords(language: LearningLanguage = this.settingsLanguage): Promise<void> {
    const response = await this.apiGet<FlipcardWordsResponse>(`flipcards/words?language=${language}`);
    this.flipcardWordInputByLanguage = {
      ...this.flipcardWordInputByLanguage,
      [language]: response.words,
    };
  }

  private async loadFlipcardAssets(language: LearningLanguage = this.assetLibraryLanguage): Promise<void> {
    const response = await this.apiGet<FlipcardAssetsResponse>(`flipcards/assets?language=${language}`);
    if (this.screen === 'assetLibrary' && this.assetLibraryLanguage !== language) return;
    this.flipcardAssets = response.items ?? [];
  }

  private lastConfiguredSpellingSetIndex(language: LearningLanguage = this.settingsLanguage): number {
    const inputs = this.spellingSetInputsByLanguage[language];
    for (let index = inputs.length - 1; index >= 0; index -= 1) {
      if (parseSpellingWords(inputs[index]).length > 0) {
        return index;
      }
    }
    return Math.max(0, inputs.length - 1);
  }

  private playCurrentSpellingAudio(): void {
    if (this.settings.audioSource === 'backend_mp3') {
      this.playCurrentBackendAudio();
      return;
    }
    const word = this.currentSpellingWord?.text;
    if (!word) return;
    void this.speakText(word, 0.86, 'Prehrani TTS skoncilo chybou.', 'Prehrani TTS selhalo.');
  }

  private playCurrentSpellingLettersAudio(): void {
    if (this.settings.audioSource === 'backend_mp3') {
      this.playCurrentBackendSpellingAudio();
      return;
    }
    const word = this.currentSpellingWord?.text;
    if (!word) return;
    void this.speakText(
      formatSpellingSpeech(word, this.selectedLanguage),
      0.82,
      'Prehrani spelling TTS skoncilo chybou.',
      'Prehrani spelling TTS selhalo.',
    );
  }

  private playCurrentBackendAudio(): void {
    const word = this.currentSpellingWord;
    if (!word) return;
    const audioUrl = this.backendAudioUrls[word.normalized];
    if (!audioUrl) return;
    void this.playBackendAudioUrl(audioUrl);
  }

  private playCurrentBackendSpellingAudio(): void {
    const word = this.currentSpellingWord;
    if (!word) return;
    const audioUrl = this.backendSpellingAudioUrls[word.normalized];
    if (!audioUrl) return;
    void this.playBackendAudioUrl(audioUrl);
  }

  private preloadAdjacentFlipcardAssets(): void {
    const indices = [this.flipcardWordIndex, this.nextFlipcardQueueIndex()]
      .filter((index): index is number => index !== null && index !== undefined);
    const keep = new Set<string>();
    for (const index of indices) {
      const word = this.flipcardWords[index];
      if (!word) continue;
      keep.add(word.normalized);
      keep.add(word.conceptKey);
      const imageUrl = this.flipcardImageUrls[word.conceptKey];
      if (imageUrl && !this.flipcardImagePreloads.has(word.conceptKey)) {
        const image = new Image();
        image.decoding = 'async';
        image.src = imageUrl;
        this.flipcardImagePreloads.set(word.conceptKey, image);
      }
      const audioUrl = this.backendAudioUrls[word.normalized];
      if (this.settings.audioSource === 'backend_mp3' && audioUrl && !this.flipcardAudioPreloads.has(word.normalized)) {
        const audio = new Audio(audioUrl);
        audio.preload = 'auto';
        audio.load();
        this.flipcardAudioPreloads.set(word.normalized, audio);
      }
    }
    for (const key of Array.from(this.flipcardImagePreloads.keys())) {
      if (!keep.has(key)) this.flipcardImagePreloads.delete(key);
    }
    for (const key of Array.from(this.flipcardAudioPreloads.keys())) {
      if (!keep.has(key)) this.flipcardAudioPreloads.delete(key);
    }
  }

  private nextFlipcardQueueIndex(): number | null {
    if (this.flipcardWordIndex === null) return null;
    return this.flipcardQueue.find((index) => index !== this.flipcardWordIndex) ?? null;
  }

  private clearFlipcardPreloads(): void {
    this.flipcardImagePreloads.clear();
    this.flipcardAudioPreloads.clear();
  }

  private async playFlipcardWordAudio(word: FlipcardWord | undefined): Promise<void> {
    if (!word) return;
    if (this.settings.audioSource === 'backend_mp3') {
      const audioUrl = this.backendAudioUrls[word.normalized];
      if (!audioUrl) return;
      await this.playBackendAudioUrl(audioUrl);
      return;
    }
    await this.speakText(word.text, 0.86, 'Prehrani TTS skoncilo chybou.', 'Prehrani TTS selhalo.');
  }

  private installTeslaMp3GestureListeners(): void {
    if (this.teslaMp3GestureHandler !== null) return;
    const handler = () => {
      void this.primeTeslaMp3AudioFromGesture();
    };
    this.teslaMp3GestureHandler = handler;
    window.addEventListener('pointerdown', handler, { capture: true, passive: true });
    window.addEventListener('click', handler, { capture: true, passive: true });
    window.addEventListener('keydown', handler, { capture: true, passive: true });
  }

  private removeTeslaMp3GestureListeners(): void {
    const handler = this.teslaMp3GestureHandler;
    if (handler === null) return;
    window.removeEventListener('pointerdown', handler, true);
    window.removeEventListener('click', handler, true);
    window.removeEventListener('keydown', handler, true);
    this.teslaMp3GestureHandler = null;
  }

  private async primeTeslaMp3AudioFromGesture(): Promise<void> {
    if (!this.teslaMp3AudioModeActive) return;
    try {
      await this.getTeslaMp3Audio().prime();
    } catch {
      // The next user gesture will try again if Tesla's Chromium blocks this one.
    }
  }

  private getTeslaMp3Audio(): TeslaMp3AudioController {
    if (this.teslaMp3Audio === null) {
      this.teslaMp3Audio = new TeslaMp3AudioController();
    }
    return this.teslaMp3Audio;
  }

  private destroyTeslaMp3Audio(): void {
    this.teslaMp3Audio?.destroy();
    this.teslaMp3Audio = null;
  }

  private async playBackendAudioUrl(audioUrl: string): Promise<void> {
    if (this.teslaMp3AudioModeActive) {
      this.backendPlaybackToken += 1;
      await this.getTeslaMp3Audio().play(audioUrl);
      return;
    }
    this.stopBackendAudio();
    const playbackToken = this.backendPlaybackToken + 1;
    this.backendPlaybackToken = playbackToken;
    await this.playAudioPreroll();
    if (this.backendPlaybackToken !== playbackToken) return;
    const audio = new Audio(audioUrl);
    audio.preload = 'auto';
    this.backendAudio = audio;
    await this.playAudioElement(audio);
    if (this.backendPlaybackToken === playbackToken && this.backendAudio === audio) {
      this.backendAudio = null;
    }
  }

  private async playAudioPreroll(): Promise<void> {
    const audio = new Audio(AUDIO_PREROLL_URL);
    audio.preload = 'auto';
    await this.playAudioElement(audio, 1200);
    await this.delay(80);
  }

  private async playAudioElement(audio: HTMLAudioElement, timeoutMs = 10000): Promise<void> {
    audio.preload = 'auto';
    audio.load();
    await this.waitForAudioReady(audio);
    try {
      audio.currentTime = 0;
    } catch {
      // Some embedded browsers reject seeking before metadata is fully available.
    }
    await this.delay(60);
    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(() => done(), timeoutMs);
      const done = () => {
        window.clearTimeout(timeout);
        audio.removeEventListener('ended', done);
        audio.removeEventListener('error', done);
        audio.removeEventListener('abort', done);
        audio.removeEventListener('emptied', done);
        resolve();
      };
      audio.addEventListener('ended', done, { once: true });
      audio.addEventListener('error', done, { once: true });
      audio.addEventListener('abort', done, { once: true });
      audio.addEventListener('emptied', done, { once: true });
      void audio.play().catch(() => done());
    });
  }

  private async waitForAudioReady(audio: HTMLAudioElement): Promise<void> {
    if (audio.readyState >= 2) return;
    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(() => done(), 4000);
      const done = () => {
        window.clearTimeout(timeout);
        audio.removeEventListener('loadeddata', done);
        audio.removeEventListener('canplay', done);
        audio.removeEventListener('error', done);
        audio.removeEventListener('abort', done);
        audio.removeEventListener('emptied', done);
        resolve();
      };
      audio.addEventListener('loadeddata', done, { once: true });
      audio.addEventListener('canplay', done, { once: true });
      audio.addEventListener('error', done, { once: true });
      audio.addEventListener('abort', done, { once: true });
      audio.addEventListener('emptied', done, { once: true });
    });
  }

  private async speakText(text: string, rate: number, errorMessage: string, failureMessage: string): Promise<void> {
    const speech = window.speechSynthesis;
    if (!speech || typeof window.SpeechSynthesisUtterance === 'undefined') {
      this.setTtsUnsupported('Web Speech API neni v tomto prohlizeci dostupne.');
      return;
    }
    const playbackToken = this.ttsPlaybackToken + 1;
    this.ttsPlaybackToken = playbackToken;
    speech.cancel();
    await this.delay(90);
    if (this.ttsPlaybackToken !== playbackToken) return;
    await new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      const timeout = window.setTimeout(() => done(), 8000);
      const done = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      utterance.lang = this.ttsLanguage();
      utterance.rate = rate;
      utterance.onend = done;
      utterance.onerror = (event) => {
        this.setTtsUnsupported(errorMessage, event.error, speech.getVoices().length);
        done();
      };
      try {
        speech.speak(utterance);
      } catch (error) {
        this.setTtsUnsupported(failureMessage, error instanceof Error ? error.message : String(error), speech.getVoices().length);
        done();
      }
    });
  }

  private stopBackendAudio(): void {
    this.backendPlaybackToken += 1;
    if (this.teslaMp3AudioModeActive) {
      this.teslaMp3Audio?.stopCurrentAndResumeLoop();
      return;
    }
    if (!this.backendAudio) return;
    const audio = this.backendAudio;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
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
      this.setScreen('login');
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

class TeslaMp3AudioController {
  private readonly audio = new Audio();
  private playbackToken = 0;
  private primed = false;
  private primePromise: Promise<void> | null = null;
  private destroyed = false;

  constructor() {
    this.audio.preload = 'auto';
  }

  async prime(): Promise<void> {
    if (this.destroyed) return;
    if (this.primed) return;
    this.primePromise ??= this.runPrime().finally(() => {
      this.primePromise = null;
    });
    await this.primePromise;
  }

  async play(audioUrl: string): Promise<void> {
    if (this.destroyed) return;
    const token = this.nextPlaybackToken();
    try {
      await this.prime();
    } catch {
      // If the silent loop is rejected, still try the requested MP3 from the same gesture.
    }
    if (this.destroyed || this.playbackToken !== token) return;

    this.audio.pause();
    this.audio.loop = false;
    this.audio.preload = 'auto';
    this.audio.src = audioUrl;
    this.audio.load();
    await this.waitForAudioReady();
    if (this.destroyed || this.playbackToken !== token) return;

    try {
      this.audio.currentTime = 0;
    } catch {
      // Some embedded browsers reject seeking before metadata is fully available.
    }
    await this.delay(60);
    await this.playUntilDone(10000);

    if (!this.destroyed && this.playbackToken === token) {
      await this.resumeSilentLoop(false);
    }
  }

  stopCurrentAndResumeLoop(): void {
    this.nextPlaybackToken();
    if (this.destroyed || !this.primed) return;
    this.audio.pause();
    void this.resumeSilentLoop(false);
  }

  destroy(): void {
    this.destroyed = true;
    this.nextPlaybackToken();
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
  }

  private async runPrime(): Promise<void> {
    await this.resumeSilentLoop(true);
    await this.delay(TESLA_AUDIO_PRIME_MS);
    if (!this.destroyed) {
      this.primed = true;
    }
  }

  private nextPlaybackToken(): number {
    this.playbackToken += 1;
    return this.playbackToken;
  }

  private async resumeSilentLoop(throwOnFailure: boolean): Promise<void> {
    if (this.destroyed) return;
    this.audio.pause();
    this.audio.loop = true;
    this.audio.preload = 'auto';
    if (this.audio.src !== TESLA_SILENT_LOOP_URL) {
      this.audio.src = TESLA_SILENT_LOOP_URL;
      this.audio.load();
    }
    try {
      this.audio.currentTime = 0;
    } catch {
      // Keep the loop best-effort if Tesla's browser refuses an early seek.
    }
    try {
      await this.audio.play();
    } catch (error) {
      if (throwOnFailure) throw error;
    }
  }

  private async waitForAudioReady(): Promise<void> {
    if (this.audio.readyState >= 2) return;
    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(() => done(), 4000);
      const done = () => {
        window.clearTimeout(timeout);
        this.audio.removeEventListener('loadeddata', done);
        this.audio.removeEventListener('canplay', done);
        this.audio.removeEventListener('error', done);
        this.audio.removeEventListener('abort', done);
        this.audio.removeEventListener('emptied', done);
        resolve();
      };
      this.audio.addEventListener('loadeddata', done, { once: true });
      this.audio.addEventListener('canplay', done, { once: true });
      this.audio.addEventListener('error', done, { once: true });
      this.audio.addEventListener('abort', done, { once: true });
      this.audio.addEventListener('emptied', done, { once: true });
    });
  }

  private async playUntilDone(timeoutMs: number): Promise<void> {
    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(() => done(), timeoutMs);
      const done = () => {
        window.clearTimeout(timeout);
        this.audio.removeEventListener('ended', done);
        this.audio.removeEventListener('error', done);
        this.audio.removeEventListener('abort', done);
        this.audio.removeEventListener('emptied', done);
        resolve();
      };
      this.audio.addEventListener('ended', done, { once: true });
      this.audio.addEventListener('error', done, { once: true });
      this.audio.addEventListener('abort', done, { once: true });
      this.audio.addEventListener('emptied', done, { once: true });
      void this.audio.play().catch(() => done());
    });
  }

  private async delay(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
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

function createSilentWavDataUrl(durationMs: number): string {
  const sampleRate = 8000;
  const channelCount = 1;
  const bytesPerSample = 2;
  const sampleCount = Math.max(1, Math.ceil((sampleRate * durationMs) / 1000));
  const dataSize = sampleCount * channelCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function readLocalBoolean(key: string, fallback: boolean): boolean {
  try {
    return window.localStorage.getItem(key) === 'true';
  } catch {
    return fallback;
  }
}

function writeLocalBoolean(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? 'true' : 'false');
  } catch {
    // Some embedded browsers may block storage; keep the in-memory setting active.
  }
}

function spellingLetterGroups(word: string): string[][] {
  return word.trim()
    .split(/\s+/)
    .map((part) => part.split('').filter((letter) => /[\p{L}\p{N}]/u.test(letter)))
    .filter((letters) => letters.length > 0);
}

function formatSpellingAnswer(word: string, language: LearningLanguage): string {
  return spellingLetterGroups(word)
    .map((letters) => letters.map((letter) => letter.toLocaleUpperCase(localeForLanguage(language))).join('-'))
    .join('  ');
}

function formatSpellingSpeech(word: string, language: LearningLanguage): string {
  return spellingLetterGroups(word)
    .map((letters) => letters.map((letter) => spellingSpeechName(letter, language)).join(', '))
    .join('. ');
}

function localeForLanguage(language: LearningLanguage): string {
  if (language === 'de') return 'de-DE';
  if (language === 'es') return 'es-ES';
  return 'en-US';
}

function spellingSpeechName(character: string, language: LearningLanguage): string {
  const letter = character.toLocaleLowerCase(localeForLanguage(language));
  if (language === 'de') {
    return ({
      a: 'A',
      b: 'Be',
      c: 'Ce',
      d: 'De',
      e: 'E',
      f: 'Ef',
      g: 'Ge',
      h: 'Ha',
      i: 'I',
      j: 'Jot',
      k: 'Ka',
      l: 'El',
      m: 'Em',
      n: 'En',
      o: 'O',
      p: 'Pe',
      q: 'Ku',
      r: 'Er',
      s: 'Es',
      t: 'Te',
      u: 'U',
      v: 'Fau',
      w: 'We',
      x: 'Ix',
      y: 'Ypsilon',
      z: 'Zett',
      ä: 'A Umlaut',
      ö: 'O Umlaut',
      ü: 'U Umlaut',
      ß: 'Eszett',
    } as Record<string, string>)[letter] ?? character;
  }
  if (language === 'es') {
    return ({
      a: 'a',
      b: 'be',
      c: 'ce',
      d: 'de',
      e: 'e',
      f: 'efe',
      g: 'ge',
      h: 'hache',
      i: 'i',
      j: 'jota',
      k: 'ka',
      l: 'ele',
      m: 'eme',
      n: 'ene',
      ñ: 'eñe',
      o: 'o',
      p: 'pe',
      q: 'cu',
      r: 'erre',
      s: 'ese',
      t: 'te',
      u: 'u',
      v: 'uve',
      w: 'uve doble',
      x: 'equis',
      y: 'ye',
      z: 'zeta',
    } as Record<string, string>)[letter] ?? character;
  }
  return character.toLocaleUpperCase('en-US');
}

function emptyStatsByDirection(): Record<PracticeDirection, Record<string, QuestionStats>> {
  return {
    product_to_factors: {},
    factors_to_product: {},
  };
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
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
