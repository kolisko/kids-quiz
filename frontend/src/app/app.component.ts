import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ArrowLeft, CarFront, Flag, Info, ListRestart, LogOut, LucideAngularModule, MessageCircleOff, Play, RefreshCw, Settings, Trophy, UserCircle } from 'lucide-angular';
import { TestSessionEngine, TestSessionOutcome } from './test-session-engine';

type Screen = 'login' | 'start' | 'audioPrep' | 'play' | 'settings' | 'assetLibrary' | 'trophies' | 'finished';
type QuizTestType = 'multiplication' | 'english';
type ActiveGame = 'multiplication' | 'spelling' | 'flipcards';
type PracticeDirection = 'product_to_factors' | 'factors_to_product';
type PracticeMode = PracticeDirection | 'mix';
type SpellingSessionMode = 'latest' | 'older';
type LearningLanguage = 'en' | 'de' | 'es' | 'cs';
type TtsStatus = 'checking' | 'supported' | 'unsupported';
type AudioSource = 'browser_tts' | 'backend_mp3';
type ArtifactStatus = 'ready' | 'missing' | 'queued' | 'generating' | 'error';
type AudioPrepStatus = 'pending' | ArtifactStatus;
type FlipcardSource = 'all_words' | 'ready_only';
type AssetLibraryTab = 'images' | 'audio';
type AudioTtsPreviewStatus = 'idle' | 'generating' | 'playing' | 'error';
type TeslaMp3PlayerState = 'off' | 'idle' | 'priming' | 'loop' | 'mp3' | 'error';
type TeslaMp3LoopMode = 'webaudio_tone_220_zero' | 'webaudio_tone_220_micro' | 'webaudio_tone_220_quiet' | 'dual_html_220_quiet';
type PollToken = { cancelled: boolean };
type AssetLibraryPollToken = PollToken & { language: LearningLanguage };
type SpellingAudioSetPollToken = PollToken & { language: LearningLanguage };

const AUDIO_PREROLL_MS = 220;
const AUDIO_PREROLL_URL = createSilentWavDataUrl(AUDIO_PREROLL_MS);
const TESLA_AUDIO_PRIME_MS = 1000;
const TESLA_MP3_AUDIO_STORAGE_KEY = 'kidsQuizTeslaMp3AudioEnabled';
const TESLA_MP3_LOOP_MODE_STORAGE_KEY = 'kidsQuizTeslaMp3LoopMode';
const DEFAULT_TESLA_MP3_LOOP_MODE: TeslaMp3LoopMode = 'webaudio_tone_220_micro';
const TESLA_MP3_TEST_POLL_TIMEOUT_MS = 180000;
const OPENAI_TTS_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar'];
const DEFAULT_AUDIO_TTS_DRAFTS: Record<LearningLanguage, AudioTtsSettingsDraft> = {
  en: {
    voice: 'marin',
    instructions: 'Pronounce this single English spelling word clearly in American English. Say only the word.',
    testWord: 'test',
    voices: OPENAI_TTS_VOICES,
  },
  de: {
    voice: 'marin',
    instructions: 'Pronounce this as a single German word in standard German phonology. Say only the word. Do not use English pronunciation, even if the spelling is identical or similar to English.',
    testWord: 'test',
    voices: OPENAI_TTS_VOICES,
  },
  es: {
    voice: 'marin',
    instructions: 'Pronounce this as a single Spanish word in neutral Spanish phonology. Say only the word. Do not use English pronunciation, even if the spelling is identical or similar to English, for example tractor, hotel, radio, animal.',
    testWord: 'test',
    voices: OPENAI_TTS_VOICES,
  },
  cs: {
    voice: 'marin',
    instructions: 'Mluv česky jako rodilý mluvčí. Vyslov vstup přirozeně česky, s českým přízvukem, českými samohláskami a přízvukem na první slabice. Řekni pouze dané české slovo nebo krátkou frázi. Nepoužívej anglickou výslovnost ani anglický přízvuk.',
    testWord: 'test',
    voices: OPENAI_TTS_VOICES,
  },
};

interface TeslaMp3LoopOption {
  mode: TeslaMp3LoopMode;
  label: string;
  description: string;
  url?: string;
  volume: number;
  backgroundMusic: boolean;
  webAudio?: {
    frequency: number;
    gain: number;
  };
  webAudioStream?: {
    frequency: number;
    gain: number;
    duckedGain: number;
    fadeMs: number;
  };
}

const TESLA_MP3_LOOP_OPTIONS: TeslaMp3LoopOption[] = [
  {
    mode: 'webaudio_tone_220_zero',
    label: 'WebAudio 220 Hz nulový',
    description: 'WebAudio oscillator běží s nulovým gainem; MP3 slovíčko se dekóduje a hraje přes stejný AudioContext.',
    volume: 1,
    backgroundMusic: false,
    webAudio: {
      frequency: 220,
      gain: 0,
    },
  },
  {
    mode: 'webaudio_tone_220_micro',
    label: 'WebAudio 220 Hz mikro',
    description: 'Velmi slabý 220Hz keepalive v AudioContextu; výchozí varianta pro Teslu.',
    volume: 1,
    backgroundMusic: false,
    webAudio: {
      frequency: 220,
      gain: 0.00018,
    },
  },
  {
    mode: 'webaudio_tone_220_quiet',
    label: 'WebAudio 220 Hz tichý',
    description: 'O něco silnější, ale pořád tichý 220Hz keepalive, když mikro nestačí držet vstup.',
    volume: 1,
    backgroundMusic: false,
    webAudio: {
      frequency: 220,
      gain: 0.00045,
    },
  },
  {
    mode: 'dual_html_220_quiet',
    label: 'Dva HTML kanály 220 Hz',
    description: 'Keepalive HTML audio běží dál, MP3 slovíčko hraje ve druhém audio elementu.',
    url: createToneWavDataUrl(TESLA_AUDIO_PRIME_MS, 220, 24),
    volume: 1,
    backgroundMusic: true,
  },
];

const TESLA_MP3_TEST_VARIANT_MODES: TeslaMp3LoopMode[] = [
  'webaudio_tone_220_zero',
  'webaudio_tone_220_micro',
  'webaudio_tone_220_quiet',
  'dual_html_220_quiet',
];

const TESLA_MP3_TEST_VARIANTS = TESLA_MP3_TEST_VARIANT_MODES.map((mode) => teslaMp3LoopOption(mode));

interface LanguageOption {
  code: LearningLanguage;
  label: string;
  ttsLang: string;
}

interface GameSettings {
  secondsLimit: number;
  targetScore: number;
  celebrationTapLimit: number;
  audioSource: AudioSource;
  flipcardSource: FlipcardSource;
  flipcardPromptLanguage: LearningLanguage;
  hiddenTestMenuKeys: string[];
}

type GameSettingsPatch = Partial<GameSettings>;

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

interface TestMenuNode {
  key: string;
  label: string;
  children: TestMenuNode[];
  launchable: boolean;
  visible: boolean;
}

type TestMenuLaunchKind = 'multiplication' | 'spelling' | 'flipcards';

interface TestMenuLaunchResponse {
  key: string;
  kind: TestMenuLaunchKind;
  settings: GameSettings;
  selectedTest?: QuizTest | null;
  selectedLanguage?: LearningLanguage | null;
  practiceMode?: PracticeMode | null;
  spellingMode?: SpellingSessionMode | null;
  questions?: Question[];
  mathStats?: Record<PracticeDirection, QuestionStatsSnapshot>;
  spellingSession?: SpellingSession | null;
  spellingStats?: SpellingStatsSnapshot | null;
  flipcardStats?: FlipcardStatsSnapshot | null;
}

interface QuestionStats {
  correct: number;
  wrong: number;
}

interface QuestionStatsSnapshot {
  statsByQuestionId: Record<string, QuestionStats>;
}

interface AuthStatusResponse {
  authenticated: boolean;
  user?: AuthUser | null;
}

interface AuthProvidersResponse {
  googleConfigured: boolean;
  passwordLoginConfigured: boolean;
}

type UserRole = 'user' | 'admin';
type UserStatus = 'active' | 'suspended';

interface AuthUser {
  id: number;
  email: string;
  displayName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  pictureUrl?: string | null;
  locale?: string | null;
  role: UserRole;
  status: UserStatus;
}

interface AdminUserSummary extends AuthUser {
  emailVerified: boolean;
  registeredAt: string;
  lastLoginAt?: string | null;
  providers: string[];
  statsCount: number;
  spellingStatsCount: number;
  flipcardStatsCount: number;
  trophyCount: number;
}

interface AdminUsersResponse {
  users: AdminUserSummary[];
}

interface AnswerResultResponse {
  questionId: number;
  stats: QuestionStats;
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
  conceptKey?: string | null;
}

interface SpellingAudioWordResponse {
  word: string;
  normalized: string;
  status: ArtifactStatus;
  kind: 'word' | 'spelling';
  audioUrl: string | null;
  error?: string | null;
}

interface SpellingAudioSetStatus {
  setId: number;
  language: LearningLanguage;
  status: ArtifactStatus;
  wordCount: number;
  uniqueWordCount: number;
  requiredAudioCount: number;
  readyAudioCount: number;
  missingAudioCount: number;
  queuedAudioCount: number;
  generatingAudioCount: number;
  errorAudioCount: number;
}

interface SpellingAudioSetStatusResponse {
  items: SpellingAudioSetStatus[];
}

interface FlipcardSpellingSyncResponse {
  language: LearningLanguage;
  spellingUniqueCount: number;
  flipcardBeforeCount: number;
  addedCount: number;
  skippedCount: number;
  addedWords: string[];
  skippedWords: string[];
}

interface AudioPrepItem {
  audioWord: string;
  normalized: string;
  word: string;
  language: LearningLanguage;
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
  imageReported: boolean;
}

interface FlipcardWordUpdate {
  conceptKey: string;
  word: string;
}

interface FlipcardWordsRequest {
  words?: string;
  items?: FlipcardWordUpdate[];
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
  imageReported: boolean;
  audioStatus: ArtifactStatus;
  audioUrl: string | null;
  audioError?: string | null;
}

interface FlipcardImageReportResponse {
  conceptKey: string;
  imageReported: boolean;
}

interface AudioTtsSettingsResponse {
  language: LearningLanguage;
  voice: string;
  instructions: string;
  testWord: string;
  voices: string[];
}

interface AudioTtsSettingsDraft {
  voice: string;
  instructions: string;
  testWord: string;
  voices: string[];
}

interface AssetLanguageVariant {
  language: LearningLanguage;
  label: string;
  word: string;
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
  warning?: string | null;
  updatedAt?: string | null;
  storedCount?: number;
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

interface MathSessionItem {
  index: number;
  direction: PracticeDirection;
}

interface MathSessionSaveResult {
  questionId: number;
  correct: boolean;
  direction: PracticeDirection;
}

interface MathSessionSaveRequest {
  results: MathSessionSaveResult[];
}

interface WordSessionSaveResult {
  word: string;
  correct: boolean;
}

interface WordSessionSaveRequest {
  results: WordSessionSaveResult[];
}

interface AnimalSurprise {
  animalKey: string;
  imagePath: string;
  animationClass: string;
}

interface TrophyItem {
  animalKey: string;
  imagePath: string;
  wonAt: string;
}

interface TrophyAwardResponse {
  awarded: TrophyItem;
  trophies: TrophyItem[];
}

type CelebrationEffect = 'pop' | 'spin' | 'squash' | 'bounce';
type CelebrationDirection = 'left' | 'right';
type CelebrationBurst = 'wide' | 'high' | 'low';

interface CelebrationTapState {
  effect: CelebrationEffect;
  direction: CelebrationDirection;
  burst: CelebrationBurst;
  offsetX: number;
  offsetY: number;
  escaping?: boolean;
}

interface CelebrationPosition {
  offsetX: number;
  offsetY: number;
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
  readonly refreshIcon = RefreshCw;
  readonly infoIcon = Info;
  readonly flagIcon = Flag;
  readonly teslaAudioIcon = CarFront;
  readonly trophyIcon = Trophy;
  readonly profileIcon = UserCircle;
  readonly logoutIcon = LogOut;
  readonly teslaMp3TestVariants = TESLA_MP3_TEST_VARIANTS;
  readonly languageOptions: LanguageOption[] = [
    { code: 'en', label: 'Angličtina', ttsLang: 'en-US' },
    { code: 'de', label: 'Němčina', ttsLang: 'de-DE' },
    { code: 'es', label: 'Španělština', ttsLang: 'es-ES' },
    { code: 'cs', label: 'Čeština', ttsLang: 'cs-CZ' },
  ];

  screen: Screen = 'login';
  loading = true;
  authLoading = false;
  authError: string | null = null;
  currentUser: AuthUser | null = null;
  profileMenuVisible = false;
  googleLoginConfigured = true;
  passwordLoginConfigured = false;
  adminUsers: AdminUserSummary[] = [];
  adminUsersLoading = false;
  adminUsersError: string | null = null;
  settingsSaved = false;
  settingsError: string | null = null;
  testMenuVisibilityDraftKeys: string[] = [];
  testMenuVisibilitySaving = false;
  testMenuVisibilitySaved = false;
  testMenuVisibilityError: string | null = null;
  spellingSetsSaved = false;
  spellingSetsError: string | null = null;
  flipcardWordsSaved = false;
  flipcardWordsError: string | null = null;
  flipcardSpellingSyncLoading = false;
  flipcardSpellingSyncResult: FlipcardSpellingSyncResponse | null = null;
  flipcardSpellingSyncError: string | null = null;
  password = '';
  snapshotNumber = 'dev';

  settings: GameSettings = { secondsLimit: 30, targetScore: 10, celebrationTapLimit: 100, audioSource: 'browser_tts', flipcardSource: 'all_words', flipcardPromptLanguage: 'cs', hiddenTestMenuKeys: [] };
  testMenuRoot: TestMenuNode | null = null;
  testMenuSettingsRoot: TestMenuNode | null = null;
  testMenuPath: string[] = [];
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
  spellingSetInputsByLanguage: Record<LearningLanguage, string[]> = { en: [''], de: [''], es: [''], cs: [''] };
  spellingSetsByLanguage: Record<LearningLanguage, SpellingSet[]> = { en: [], de: [], es: [], cs: [] };
  spellingAudioSetStatusesByLanguage: Record<LearningLanguage, Record<number, SpellingAudioSetStatus>> = { en: {}, de: {}, es: {}, cs: {} };
  spellingAudioSetGenerating: Record<number, boolean> = {};
  spellingAudioSetErrors: Record<number, string> = {};
  flipcardWordInputByLanguage: Record<LearningLanguage, string> = { en: '', de: '', es: '', cs: '' };
  flipcardWordsByLanguage: Record<LearningLanguage, FlipcardWord[]> = { en: [], de: [], es: [], cs: [] };
  latestSpellingSetIndexByLanguage: Record<LearningLanguage, number> = { en: 0, de: 0, es: 0, cs: 0 };
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
  spellingImageLoaded = false;
  spellingImageError: string | null = null;
  flipcardPromptAudioToken = 0;
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
  assetLibraryTab: AssetLibraryTab = 'images';
  assetLibraryLanguage: LearningLanguage = 'en';
  flipcardAssets: FlipcardAsset[] = [];
  assetLibraryShowReportedOnly = false;
  assetLibraryLoading = false;
  assetLibraryError: string | null = null;
  assetImageGenerating: Record<string, boolean> = {};
  assetAudioGenerating: Record<string, boolean> = {};
  assetImageBulkEnqueueLoading = false;
  assetAudioBulkEnqueueLoading = false;
  assetImageErrors: Record<string, string> = {};
  assetAudioErrors: Record<string, string> = {};
  imageReportSaving: Record<string, boolean> = {};
  audioTtsDraftsByLanguage: Record<LearningLanguage, AudioTtsSettingsDraft> = structuredClone(DEFAULT_AUDIO_TTS_DRAFTS);
  audioTtsSettingsLoading = false;
  audioTtsSettingsSaving = false;
  audioTtsPreviewStatus: AudioTtsPreviewStatus = 'idle';
  audioTtsSettingsSaved = false;
  audioTtsSettingsError: string | null = null;
  audioTtsSettingsExpanded = false;
  assetTranslationInfoKey: string | null = null;
  trophies: TrophyItem[] = [];
  trophiesLoading = false;
  trophiesError: string | null = null;
  translationBackfillStatusByLanguage: Record<LearningLanguage, FlipcardTranslationBackfillStatusResponse | null> = { en: null, de: null, es: null, cs: null };
  translationBackfillLoading = false;
  translationBackfillError: string | null = null;
  backendAudioUrls: Record<string, string> = {};
  backendSpellingAudioUrls: Record<string, string> = {};
  flipcardPromptAudioUrls: Record<string, string> = {};
  flipcardImageUrls: Record<string, string> = {};
  flipcardAdvancing = false;
  teslaMp3AudioEnabled = readLocalBoolean(TESLA_MP3_AUDIO_STORAGE_KEY, false);
  teslaMp3LoopMode: TeslaMp3LoopMode = readLocalLoopMode();
  teslaMp3TestActiveMode: TeslaMp3LoopMode | null = null;
  teslaMp3TestBusyMode: TeslaMp3LoopMode | null = null;
  teslaMp3TestStatus: string | null = null;
  teslaMp3PlayerState: TeslaMp3PlayerState = 'off';
  celebrationTap: CelebrationTapState | null = null;
  celebrationPosition: CelebrationPosition = { offsetX: 0, offsetY: 0 };
  celebrationTapCount = 0;
  spellingAnswerWordActive = false;

  private readonly mathSession = new TestSessionEngine<MathSessionItem>();
  private readonly spellingSession = new TestSessionEngine<number>();
  private readonly flipcardSession = new TestSessionEngine<number>();
  private timerId: number | null = null;
  private flashTimerId: number | null = null;
  private ttsVoicesTimerId: number | null = null;
  private ttsVoicesChangedHandler: (() => void) | null = null;
  private backendAudio: HTMLAudioElement | null = null;
  private teslaMp3Audio: TeslaMp3AudioController | null = null;
  private readonly teslaMp3TestAudio = new Map<TeslaMp3LoopMode, TeslaMp3AudioController>();
  private readonly teslaMp3TestAudioUrls = new Map<string, string>();
  private backendPlaybackToken = 0;
  private ttsPlaybackToken = 0;
  private spellingAudioSequenceToken = 0;
  private celebrationTapTimerId: number | null = null;
  private spellingAnswerWordTimerId: number | null = null;
  private lastCelebrationFanfareIndex = -1;
  private finishingSession = false;
  private assetLibraryPollToken: AssetLibraryPollToken | null = null;
  private audioPrepPollToken: PollToken | null = null;
  private spellingAudioSetPollToken: SpellingAudioSetPollToken | null = null;
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

  get teslaMp3AudioBadgeVisible(): boolean {
    return this.teslaMp3PlayerState === 'priming'
      || this.teslaMp3PlayerState === 'loop'
      || this.teslaMp3PlayerState === 'mp3'
      || this.teslaMp3PlayerState === 'error';
  }

  get teslaMp3AudioBadgeLabel(): string {
    const stateLabel = ({
      off: 'vypnuto',
      idle: 'čeká',
      priming: 'startuje',
      loop: 'tichá smyčka běží',
      mp3: 'přehrává MP3',
      error: 'chyba přehrávání',
    } as Record<TeslaMp3PlayerState, string>)[this.teslaMp3PlayerState];
    return `Tesla MP3 režim: ${stateLabel}`;
  }

  get currentTeslaMp3LoopOption(): TeslaMp3LoopOption {
    return teslaMp3LoopOption(this.teslaMp3LoopMode);
  }

  get celebrationTapOffsetX(): number {
    return this.celebrationPosition.offsetX;
  }

  get celebrationTapOffsetY(): number {
    return this.celebrationPosition.offsetY;
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

  get currentSpellingConceptKey(): string | null {
    return this.currentSpellingWord?.conceptKey ?? null;
  }

  get currentSpellingImageUrl(): string | null {
    const conceptKey = this.currentSpellingConceptKey;
    return conceptKey ? this.flipcardImageUrls[conceptKey] ?? null : null;
  }

  get currentFlipcardPromptWord(): FlipcardWord | null {
    const word = this.currentFlipcardWord;
    if (!word) return null;
    return this.flipcardPromptWordForConcept(word.conceptKey);
  }

  get currentFlipcardPromptText(): string {
    return this.currentFlipcardPromptWord?.text ?? '';
  }

  get currentFlipcardImageReported(): boolean {
    return this.currentFlipcardWord?.imageReported ?? false;
  }

  get currentFlipcardImageReportSaving(): boolean {
    const conceptKey = this.currentFlipcardWord?.conceptKey;
    return conceptKey ? Boolean(this.imageReportSaving[conceptKey]) : false;
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

  get spellingAnswerTextClickable(): boolean {
    return this.activeGame === 'spelling' && this.answerVisible && this.currentSpellingWord !== null;
  }

  get currentAnswerHint(): string | null {
    if (this.activeGame === 'spelling') return null;
    if (this.currentDirection !== 'product_to_factors') return null;
    const count = this.currentQuestion?.answers.length ?? 0;
    return count > 1 ? answerCountLabel(count) : null;
  }

  get scoreGoal(): number {
    if (this.activeGame === 'spelling') return this.spellingSession.selectedCount;
    if (this.activeGame === 'flipcards') return this.flipcardSession.selectedCount;
    return this.mathSession.selectedCount || this.settings.targetScore;
  }

  get spellingSetsConfigured(): boolean {
    return this.spellingSetInputsByLanguage[this.settingsLanguage].some((value) => parseSpellingWords(value).length > 0);
  }

  spellingSavedSetForIndex(index: number): SpellingSet | null {
    const language = this.settingsLanguage;
    const savedSet = this.spellingSetsByLanguage[language][index];
    const currentRawWords = this.spellingSetInputsByLanguage[language][index]?.trim() ?? '';
    if (!savedSet || savedSet.rawWords.trim() !== currentRawWords) return null;
    return savedSet;
  }

  spellingAudioSetStatusFor(setId: number): SpellingAudioSetStatus | null {
    return this.spellingAudioSetStatusesByLanguage[this.settingsLanguage][setId] ?? null;
  }

  spellingAudioSetStatusLabel(status: SpellingAudioSetStatus): string {
    const progress = `${status.readyAudioCount}/${status.requiredAudioCount}`;
    if (status.requiredAudioCount === 0) return 'Audio: bez slov';
    if (status.status === 'ready') return `Audio hotovo ${progress}`;
    if (status.status === 'generating') return `Generuji audio ${progress}`;
    if (status.status === 'queued') return `Audio ve frontě ${progress}`;
    if (status.status === 'error') return `Audio chyba ${progress}`;
    return `Chybí audio ${progress}`;
  }

  spellingAudioSetButtonLabel(setId: number): string {
    if (this.spellingAudioSetGenerating[setId]) return 'Doplňuji...';
    const status = this.spellingAudioSetStatusFor(setId);
    if (status?.status === 'ready') return 'Audio hotovo';
    return 'Doplnit audio';
  }

  spellingAudioSetActionDisabled(setId: number): boolean {
    const status = this.spellingAudioSetStatusFor(setId);
    return this.loading
      || Boolean(this.spellingAudioSetGenerating[setId])
      || !status
      || status.requiredAudioCount === 0
      || status.status === 'ready'
      || status.status === 'queued'
      || status.status === 'generating';
  }

  get currentTestMenuNode(): TestMenuNode | null {
    let node = this.testMenuRoot;
    for (const key of this.testMenuPath) {
      node = node?.children.find((child) => child.key === key) ?? null;
      if (!node) return null;
    }
    return node;
  }

  get currentTestMenuChildren(): TestMenuNode[] {
    return this.currentTestMenuNode?.children ?? [];
  }

  get currentTestMenuTitle(): string {
    return this.testMenuPath.length === 0 ? 'Kids Quiz' : this.currentTestMenuNode?.label ?? 'Testy';
  }

  get currentTestMenuIsRoot(): boolean {
    return this.testMenuPath.length === 0;
  }

  get hasVisibleTestMenu(): boolean {
    return this.currentTestMenuChildren.length > 0;
  }

  get testMenuVisibilityDirty(): boolean {
    return !sameStringList(
      this.effectiveDraftTestMenuHiddenKeys(),
      this.effectiveSavedTestMenuHiddenKeys(),
    );
  }

  get settingsLanguageLabel(): string {
    return this.languageLabel(this.settingsLanguage);
  }

  get isAdmin(): boolean {
    return this.currentUser?.role === 'admin';
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

  get reportedImageAssetsCount(): number {
    return this.flipcardAssets.filter((asset) => asset.imageReported).length;
  }

  get visibleFlipcardAssets(): FlipcardAsset[] {
    return this.assetLibraryShowReportedOnly
      ? this.flipcardAssets.filter((asset) => asset.imageReported)
      : this.flipcardAssets;
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

  get currentAudioTtsDraft(): AudioTtsSettingsDraft {
    return this.audioTtsDraftsByLanguage[this.assetLibraryLanguage];
  }

  get audioTtsPreviewIcon() {
    return this.audioTtsPreviewStatus === 'generating' ? this.refreshIcon : this.playIcon;
  }

  get audioTtsPreviewTitle(): string {
    if (this.audioTtsPreviewStatus === 'generating') return 'Generuji testovací audio';
    if (this.audioTtsPreviewStatus === 'playing') return 'Přehrávám testovací audio';
    if (this.audioTtsPreviewStatus === 'error') return 'Testovací audio selhalo';
    return 'Otestovat prompt a hlas';
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

  get flipcardSpellingSyncSummary(): string {
    const result = this.flipcardSpellingSyncResult;
    if (!result) return '';
    if (result.addedCount === 0 && result.skippedCount === 0) {
      return `Všech ${result.spellingUniqueCount} spelling slov už je ve flipcards.`;
    }
    const added = `Doplněno ${result.addedCount}`;
    const skipped = result.skippedCount > 0 ? `, přeskočeno ${result.skippedCount}` : '';
    return `${added}${skipped}. Flipcards před syncem: ${result.flipcardBeforeCount}.`;
  }

  get flipcardSpellingSyncButtonLabel(): string {
    if (this.flipcardSpellingSyncLoading) return 'Doplňuji...';
    return `Doplnit ${this.flipcardSpellingSyncMissingCount} ze spellingu`;
  }

  get flipcardSpellingSyncMissingCount(): number {
    const spellingWords = this.spellingSetsByLanguage[this.settingsLanguage]
      .flatMap((set) => set.words)
      .filter((word) => word.normalized.trim() !== '');
    const flipcardWords = new Set(
      this.flipcardWordsByLanguage[this.settingsLanguage]
        .map((word) => word.normalized)
        .filter((normalized) => normalized.trim() !== ''),
    );
    return new Set(
      spellingWords
        .map((word) => word.normalized)
        .filter((normalized) => !flipcardWords.has(normalized)),
    ).size;
  }

  get translationBackfillSummary(): string {
    const status = this.currentTranslationBackfillStatus;
    if (!status) return 'Stav překladů zatím není načtený.';
    return `Překlady ${status.readyCount} / ${status.totalCount} - ${this.translationBackfillStatusLabel(status.status)}`;
  }

  get translationBackfillWarning(): string | null {
    const status = this.currentTranslationBackfillStatus;
    if (!status?.warning) return null;
    if (status.warning === 'translation_count_mismatch') {
      return `Pozor: poslední doplnění hlásilo ${status.storedCount ?? '?'} překladů, ale v databázi je reálně ${status.readyCount}. Spusť Doplnit překlady.`;
    }
    return status.warning;
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
    void this.loadSnapshotNumber();
    await this.loadGameData();
  }

  ngOnDestroy(): void {
    this.cancelAssetLibraryPolling();
    this.cancelAudioPrepPolling();
    this.cancelSpellingAudioSetPolling();
    this.cancelTranslationBackfillPolling();
    this.clearTimer();
    this.clearFlashTimer();
    this.clearTtsVoiceCheck();
    this.stopBackendAudio();
    this.destroyTeslaMp3Audio();
    this.destroyTeslaMp3TestAudio();
    this.clearCelebrationTapTimer();
    this.clearSpellingAnswerWordTimer();
  }

  startGoogleLogin(): void {
    this.authLoading = true;
    this.authError = null;
    window.location.href = '/api/auth/google/start';
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

  toggleProfileMenu(): void {
    this.profileMenuVisible = !this.profileMenuVisible;
  }

  async logout(): Promise<void> {
    this.authLoading = true;
    this.authError = null;
    this.profileMenuVisible = false;
    try {
      await this.apiPost<AuthStatusResponse>('auth/logout', {}, false);
    } catch {
      // Even if the server session is already gone, the local UI should return to login.
    } finally {
      this.currentUser = null;
      this.selectedTest = null;
      this.selectedMode = null;
      this.questions = [];
      this.serverStats = emptyStatsByDirection();
      this.spellingStats = {};
      this.flipcardStats = {};
      this.authLoading = false;
      await this.loadAuthProviders();
      this.setScreen('login');
      this.render();
    }
  }

  selectTestMenuNode(node: TestMenuNode): void {
    if (node.children.length > 0) {
      this.testMenuPath = [...this.testMenuPath, node.key];
      this.render();
      return;
    }
    if (node.launchable) {
      void this.launchTestMenuNode(node);
    }
  }

  backInTestMenu(): void {
    if (this.testMenuPath.length === 0) return;
    this.testMenuPath = this.testMenuPath.slice(0, -1);
    this.render();
  }

  async launchTestMenuNode(node: TestMenuNode): Promise<void> {
    if (!node.launchable || this.loading) return;
    this.loading = true;
    this.resetRoundState();
    this.render();
    try {
      const launch = await this.apiPost<TestMenuLaunchResponse>('test-menu/launch', { key: node.key });
      this.applySettings(launch.settings);
      if (launch.kind === 'multiplication') {
        this.startLaunchedMath(launch);
      } else if (launch.kind === 'spelling') {
        await this.startLaunchedSpelling(launch);
      } else if (launch.kind === 'flipcards') {
        await this.startLaunchedFlipcards(launch);
      }
    } catch {
      this.audioPrepError = 'Test se nepodařilo spustit.';
      this.setScreen('start');
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private startLaunchedMath(launch: TestMenuLaunchResponse): void {
    this.activeGame = 'multiplication';
    this.selectedTest = launch.selectedTest ?? null;
    this.selectedMode = launch.practiceMode ?? 'mix';
    this.questions = launch.questions ?? [];
    this.serverStats = {
      product_to_factors: launch.mathStats?.product_to_factors?.statsByQuestionId ?? {},
      factors_to_product: launch.mathStats?.factors_to_product?.statsByQuestionId ?? {},
    };
    void this.startTeslaMp3AudioForTest();
    this.startMathSession();
    this.setScreen('play');
    this.pickQuestion();
  }

  private async startLaunchedSpelling(launch: TestMenuLaunchResponse): Promise<void> {
    const language = launch.selectedLanguage ?? 'en';
    this.activeGame = 'spelling';
    this.selectedLanguage = language;
    this.selectedTest = launch.selectedTest ?? {
      id: -1,
      name: this.languageLabel(language),
      type: 'english',
      questionCount: 0,
    };
    this.spellingStats = launch.spellingStats?.statsByWord ?? {};
    this.spellingWords = launch.spellingSession?.words ?? [];
    this.startSpellingSession();
    await this.prepareSpellingAssets();
  }

  private async startLaunchedFlipcards(launch: TestMenuLaunchResponse): Promise<void> {
    const language = launch.selectedLanguage ?? 'en';
    this.activeGame = 'flipcards';
    this.selectedLanguage = language;
    this.selectedTest = launch.selectedTest ?? {
      id: -1,
      name: this.languageLabel(language),
      type: 'english',
      questionCount: 0,
    };
    void this.startTeslaMp3AudioForTest();
    this.flipcardStats = launch.flipcardStats?.statsByWord ?? {};
    await this.loadFlipcardWords(this.settings.flipcardPromptLanguage);
    const answerPool = await this.loadFlipcardAnswerPool();
    this.flipcardWords = answerPool;
    this.flipcardAnswerPool = answerPool;
    this.startFlipcardSession();
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
  }

  private async loadFlipcardAnswerPool(): Promise<FlipcardWord[]> {
    if (this.settings.flipcardSource === 'ready_only') {
      const [answerAssets, promptAssets] = await Promise.all([
        this.apiGet<FlipcardAssetsResponse>(`flipcards/assets?language=${this.selectedLanguage}`),
        this.apiGet<FlipcardAssetsResponse>(`flipcards/assets?language=${this.settings.flipcardPromptLanguage}`),
      ]);
      const readyPromptConcepts = new Set(
        promptAssets.items
          .filter((asset) => asset.audioStatus === 'ready')
          .map((asset) => asset.conceptKey),
      );
      return answerAssets.items
        .filter((asset) => asset.imageStatus === 'ready' && asset.audioStatus === 'ready' && readyPromptConcepts.has(asset.conceptKey))
        .map((asset) => ({ text: asset.word, normalized: asset.normalized, conceptKey: asset.conceptKey, imageReported: asset.imageReported }));
    }
    const response = await this.apiGet<FlipcardWordsResponse>(`flipcards/words?language=${this.selectedLanguage}`);
    return response.items;
  }

  showAnswer(): void {
    this.revealAnswer();
  }

  replaySpellingAudio(): void {
    void this.playCurrentSpellingWordAudio();
  }

  replaySpellingAnswerAudio(): void {
    void this.playCurrentSpellingAnswerThenWord();
  }

  async playSpellingAnswerWordFromText(): Promise<void> {
    if (!this.spellingAnswerTextClickable) return;
    const word = this.currentSpellingWord;
    if (!word) return;
    const token = this.nextSpellingAudioSequenceToken();
    this.setSpellingAnswerWordActive(true);
    try {
      if (this.settings.audioSource === 'backend_mp3') {
        await this.playCurrentBackendSpellingAudio(token);
        if (!this.spellingAudioSequenceStillCurrent(token, word.normalized)) return;
        await this.playCurrentBackendAudio(token);
      } else {
        await this.speakText(
          formatSpellingSpeech(word.text, this.selectedLanguage),
          0.82,
          'Prehrani spelling TTS skoncilo chybou.',
          'Prehrani spelling TTS selhalo.',
        );
        if (!this.spellingAudioSequenceStillCurrent(token, word.normalized)) return;
        await this.speakText(word.text, 0.86, 'Prehrani TTS skoncilo chybou.', 'Prehrani TTS selhalo.');
      }
    } finally {
      if (this.spellingAudioSequenceStillCurrent(token, word.normalized)) {
        this.spellingAnswerWordTimerId = window.setTimeout(() => {
          this.spellingAnswerWordTimerId = null;
          this.setSpellingAnswerWordActive(false);
        }, 140);
      }
    }
  }

  async retryAudioGeneration(): Promise<void> {
    if (this.activeGame === 'spelling' && this.spellingWords.length > 0) {
      await this.prepareSpellingAssets();
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
      this.destroyTeslaMp3TestAudio();
    }
  }

  onTeslaMp3AudioEnabledChange(enabled: boolean): void {
    this.teslaMp3AudioEnabled = enabled;
    writeLocalBoolean(TESLA_MP3_AUDIO_STORAGE_KEY, enabled);
    if (!enabled || this.settings.audioSource !== 'backend_mp3') {
      this.destroyTeslaMp3Audio();
      this.destroyTeslaMp3TestAudio();
    } else if (this.teslaMp3Audio === null) {
      this.updateTeslaMp3PlayerState('idle');
    }
  }

  selectTeslaMp3LoopMode(mode: TeslaMp3LoopMode): void {
    this.teslaMp3LoopMode = teslaMp3LoopOption(mode).mode;
    writeLocalString(TESLA_MP3_LOOP_MODE_STORAGE_KEY, this.teslaMp3LoopMode);
    this.teslaMp3Audio?.setLoopMode(this.teslaMp3LoopMode);
  }

  isTeslaMp3VariantActive(mode: TeslaMp3LoopMode): boolean {
    return this.teslaMp3TestActiveMode === mode;
  }

  isTeslaMp3VariantBusy(mode: TeslaMp3LoopMode): boolean {
    return this.teslaMp3TestBusyMode === mode;
  }

  async toggleTeslaMp3VariantLoopTest(mode: TeslaMp3LoopMode): Promise<void> {
    if (!this.canRunTeslaMp3VariantTest()) return;
    if (this.teslaMp3TestActiveMode === mode) {
      this.stopTeslaMp3TestController(mode);
      this.teslaMp3TestStatus = null;
      this.render();
      return;
    }
    this.teslaMp3TestBusyMode = mode;
    this.teslaMp3TestStatus = `Spouštím: ${teslaMp3LoopOption(mode).label}`;
    this.render();
    try {
      await this.startTeslaMp3VariantLoop(mode);
      this.teslaMp3TestStatus = `Běží: ${teslaMp3LoopOption(mode).label}`;
    } catch (error) {
      this.teslaMp3TestStatus = error instanceof Error ? error.message : 'Testovací smyčku se nepodařilo spustit.';
      this.stopTeslaMp3TestController(mode);
    } finally {
      if (this.teslaMp3TestBusyMode === mode) {
        this.teslaMp3TestBusyMode = null;
      }
      this.render();
    }
  }

  async playTeslaMp3VariantTestWord(mode: TeslaMp3LoopMode): Promise<void> {
    if (!this.canRunTeslaMp3VariantTest()) return;
    this.teslaMp3TestBusyMode = mode;
    this.teslaMp3TestStatus = `Připravuju testovací MP3: ${this.teslaMp3TestWordForLanguage(this.settingsLanguage)}`;
    this.render();
    try {
      const audioUrl = await this.resolveTeslaMp3TestAudioUrl();
      const controller = await this.startTeslaMp3VariantLoop(mode);
      this.teslaMp3TestStatus = `Přehrávám test přes: ${teslaMp3LoopOption(mode).label}`;
      this.render();
      await controller.play(audioUrl);
      if (this.teslaMp3TestActiveMode === mode) {
        this.teslaMp3TestStatus = `Po testu dál běží: ${teslaMp3LoopOption(mode).label}`;
      }
    } catch (error) {
      this.teslaMp3TestStatus = error instanceof Error ? error.message : 'Testovací slovo se nepodařilo přehrát.';
    } finally {
      if (this.teslaMp3TestBusyMode === mode) {
        this.teslaMp3TestBusyMode = null;
      }
      this.render();
    }
  }

  markWrong(): void {
    const index = this.activeGame === 'spelling' ? this.spellingWordIndex : this.currentIndex;
    if (index === null) return;
    this.recordSessionOutcome('wrong');
    this.score = this.currentSessionCompletedCount();
    this.showPenalty();
    this.pickQuestion();
  }

  markCorrect(): void {
    const index = this.activeGame === 'spelling' ? this.spellingWordIndex : this.currentIndex;
    if (index === null) return;
    this.recordSessionOutcome('correct');
    this.score = this.currentSessionCompletedCount();
    if (this.currentSessionFinished()) {
      void this.finishSession();
      return;
    }
    this.pickQuestion();
  }

  nextAfterTimeout(): void {
    this.pickQuestion();
  }

  async openSettings(): Promise<void> {
    this.stopTeslaMp3AudioForTest();
    this.setScreen('settings');
    this.clearTimer();
    this.ttsDetailsVisible = false;
    this.settingsSaved = false;
    this.settingsError = null;
    this.testMenuVisibilitySaving = false;
    this.testMenuVisibilitySaved = false;
    this.testMenuVisibilityError = null;
    this.loading = true;
    this.render();
    try {
      await this.loadSettings();
      await Promise.all([
        this.loadTestMenuSettings(),
        this.isAdmin ? this.loadAllLanguageSettings() : Promise.resolve(),
        this.isAdmin ? this.loadAdminUsers() : Promise.resolve(),
      ]);
    } catch {
      this.settingsError = 'Nastavení se nepodařilo načíst.';
    } finally {
      this.loading = false;
      if (this.isAdmin) {
        this.startSpellingAudioSetPolling(this.settingsLanguage);
      }
      this.render();
    }
  }

  async loadAdminUsers(): Promise<void> {
    if (!this.isAdmin) return;
    this.adminUsersLoading = true;
    this.adminUsersError = null;
    try {
      const response = await this.apiGet<AdminUsersResponse>('admin/users');
      this.adminUsers = response.users ?? [];
    } catch {
      this.adminUsersError = 'Uživatele se nepodařilo načíst.';
    } finally {
      this.adminUsersLoading = false;
    }
  }

  async setAdminUserStatus(user: AdminUserSummary, status: UserStatus): Promise<void> {
    if (!this.isAdmin || user.status === status) return;
    this.adminUsersError = null;
    try {
      await this.apiPut<AuthUser>(`admin/users/${user.id}/status`, { status });
      await this.loadAdminUsers();
    } catch {
      this.adminUsersError = 'Stav uživatele se nepodařilo uložit.';
    } finally {
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
    this.imageReportSaving = {};
    this.audioTtsSettingsError = null;
    this.audioTtsSettingsSaved = false;
    this.audioTtsPreviewStatus = 'idle';
    this.audioTtsSettingsExpanded = false;
    this.assetTranslationInfoKey = null;
    this.assetLibraryLoading = true;
    this.setScreen('assetLibrary');
    this.render();
    try {
      await Promise.all([
        this.loadFlipcardAssets(language),
        this.loadAudioTtsSettings(language),
      ]);
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

  async openTrophies(): Promise<void> {
    this.clearTimer();
    this.ttsDetailsVisible = false;
    this.trophiesError = null;
    this.trophiesLoading = true;
    this.setScreen('trophies');
    this.render();
    try {
      this.trophies = await this.apiGet<TrophyItem[]>('trophies');
    } catch {
      this.trophiesError = 'Sbírku fumfíků se nepodařilo načíst.';
    } finally {
      this.trophiesLoading = false;
      this.render();
    }
  }

  setAssetLibraryTab(tab: AssetLibraryTab): void {
    this.assetLibraryTab = tab;
    this.assetTranslationInfoKey = null;
    this.audioTtsSettingsError = null;
    this.audioTtsSettingsSaved = false;
  }

  toggleAudioTtsSettingsExpanded(): void {
    this.audioTtsSettingsExpanded = !this.audioTtsSettingsExpanded;
  }

  toggleAssetLibraryReportedFilter(): void {
    this.assetLibraryShowReportedOnly = !this.assetLibraryShowReportedOnly;
  }

  selectSettingsLanguage(language: LearningLanguage): void {
    this.settingsLanguage = language;
    this.translationBackfillError = null;
    this.spellingSetsSaved = false;
    this.spellingSetsError = null;
    this.flipcardWordsSaved = false;
    this.flipcardWordsError = null;
    this.flipcardSpellingSyncResult = null;
    this.flipcardSpellingSyncError = null;
    if (this.isAdmin && language !== 'en') {
      void this.loadTranslationBackfillStatus(language);
    }
    if (this.isAdmin) {
      void this.loadSpellingAudioSetStatuses(language)
        .then(() => this.startSpellingAudioSetPolling(language))
        .catch(() => {
          this.spellingSetsError = 'Stav spelling audia se nepodařilo načíst.';
          this.render();
        });
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

  async saveAudioTtsSettings(): Promise<void> {
    if (this.audioTtsSettingsSaving) return;
    const language = this.assetLibraryLanguage;
    const draft = this.currentAudioTtsDraft;
    this.audioTtsSettingsSaving = true;
    this.audioTtsSettingsSaved = false;
    this.audioTtsSettingsError = null;
    this.render();
    try {
      const response = await this.apiPut<AudioTtsSettingsResponse>(
        `flipcards/audio-settings?language=${language}`,
        {
          voice: draft.voice,
          instructions: draft.instructions,
          testWord: draft.testWord,
        },
      );
      this.applyAudioTtsSettings(response);
      this.audioTtsSettingsSaved = true;
      await this.loadFlipcardAssets(language);
    } catch (error) {
      this.audioTtsSettingsError = error instanceof Error ? error.message : 'TTS nastavení se nepodařilo uložit.';
    } finally {
      this.audioTtsSettingsSaving = false;
      this.render();
    }
  }

  async testAudioTtsSettings(): Promise<void> {
    if (this.audioTtsPreviewStatus === 'generating' || this.audioTtsPreviewStatus === 'playing') return;
    const language = this.assetLibraryLanguage;
    const draft = this.currentAudioTtsDraft;
    this.audioTtsPreviewStatus = 'generating';
    this.audioTtsSettingsSaved = false;
    this.audioTtsSettingsError = null;
    this.render();
    try {
      const response = await fetch(`/api/flipcards/audio-settings/test?language=${language}`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice: draft.voice,
          instructions: draft.instructions,
          testWord: draft.testWord,
        }),
      });
      if (response.status === 401) {
        this.audioTtsPreviewStatus = 'idle';
        this.setScreen('login');
        return;
      }
      if (!response.ok) {
        const body = await response.text();
        throw new Error(parseApiError(body) ?? `API ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      this.audioTtsPreviewStatus = 'playing';
      this.render();
      await this.playBlobAudio(url);
      URL.revokeObjectURL(url);
      this.audioTtsPreviewStatus = 'idle';
    } catch (error) {
      this.audioTtsPreviewStatus = 'error';
      this.audioTtsSettingsError = error instanceof Error ? error.message : 'Testovací audio se nepodařilo přehrát.';
    } finally {
      this.render();
    }
  }

  async toggleAssetImageReport(asset: FlipcardAsset): Promise<void> {
    await this.setFlipcardImageReported(asset.conceptKey, !asset.imageReported);
  }

  async toggleCurrentFlipcardImageReport(event?: Event): Promise<void> {
    event?.stopPropagation();
    const word = this.currentFlipcardWord;
    if (!word) return;
    await this.setFlipcardImageReported(word.conceptKey, !word.imageReported);
  }

  toggleAssetTranslationInfo(asset: FlipcardAsset): void {
    const key = this.assetTranslationInfoKeyFor(asset);
    this.assetTranslationInfoKey = this.assetTranslationInfoKey === key ? null : key;
  }

  assetTranslationInfoVisible(asset: FlipcardAsset): boolean {
    return this.assetTranslationInfoKey === this.assetTranslationInfoKeyFor(asset);
  }

  assetImageReportTitle(asset: FlipcardAsset): string {
    return asset.imageReported ? 'Obrázek nahlášen' : 'Nahlásit obrázek';
  }

  assetImageReportSaving(asset: FlipcardAsset): boolean {
    return Boolean(this.imageReportSaving[asset.conceptKey]);
  }

  assetLanguageVariants(asset: FlipcardAsset): AssetLanguageVariant[] {
    return this.languageOptions.map((language) => {
      const word = this.flipcardWordsByLanguage[language.code]
        .find((candidate) => candidate.conceptKey === asset.conceptKey)?.text
        ?? (language.code === asset.language ? asset.word : '-');
      return {
        language: language.code,
        label: language.label,
        word,
      };
    });
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
    await this.enqueueAssetAudio(asset, false);
  }

  async regenerateAssetAudio(asset: FlipcardAsset): Promise<void> {
    if (this.assetAudioIsGenerating(asset)) return;
    await this.enqueueAssetAudio(asset, true);
  }

  private async enqueueAssetAudio(asset: FlipcardAsset, force: boolean): Promise<void> {
    this.assetAudioGenerating = { ...this.assetAudioGenerating, [asset.normalized]: true };
    const { [asset.normalized]: _removed, ...nextErrors } = this.assetAudioErrors;
    this.assetAudioErrors = nextErrors;
    this.render();

    try {
      const response = await this.apiPost<SpellingAudioWordResponse>(this.flipcardAudioPath(asset.word, asset.language, force), {});
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

  private async setFlipcardImageReported(conceptKey: string, reported: boolean): Promise<void> {
    if (this.imageReportSaving[conceptKey]) return;
    const previous = this.imageReportedForConcept(conceptKey);
    this.imageReportSaving = { ...this.imageReportSaving, [conceptKey]: true };
    this.applyFlipcardImageReport({ conceptKey, imageReported: reported });
    try {
      const response = await this.apiPut<FlipcardImageReportResponse>(
        `flipcards/images/${encodeURIComponent(conceptKey)}/reported`,
        { reported },
      );
      this.applyFlipcardImageReport(response);
    } catch (error) {
      this.applyFlipcardImageReport({ conceptKey, imageReported: previous });
      if (this.screen === 'assetLibrary') {
        this.assetLibraryError = error instanceof Error ? error.message : 'Nahlášení obrázku se nepodařilo uložit.';
      }
    } finally {
      const { [conceptKey]: _removed, ...nextSaving } = this.imageReportSaving;
      this.imageReportSaving = nextSaving;
      this.render();
    }
  }

  private imageReportedForConcept(conceptKey: string): boolean {
    const asset = this.flipcardAssets.find((item) => item.conceptKey === conceptKey);
    if (asset) return asset.imageReported;
    const current = this.flipcardWords.find((word) => word.conceptKey === conceptKey);
    if (current) return current.imageReported;
    return Object.values(this.flipcardWordsByLanguage)
      .flat()
      .find((word) => word.conceptKey === conceptKey)
      ?.imageReported ?? false;
  }

  private applyFlipcardImageReport(response: FlipcardImageReportResponse): void {
    const updateWord = (word: FlipcardWord): FlipcardWord => (
      word.conceptKey === response.conceptKey ? { ...word, imageReported: response.imageReported } : word
    );
    const updateOption = (option: FlipcardOption): FlipcardOption => ({
      ...option,
      word: updateWord(option.word),
    });
    this.flipcardWords = this.flipcardWords.map(updateWord);
    this.flipcardAnswerPool = this.flipcardAnswerPool.map(updateWord);
    this.flipcardOptions = this.flipcardOptions.map(updateOption);
    this.flipcardOptionsByIndex = this.flipcardOptionsByIndex.map((options) => options.map(updateOption));
    this.flipcardWordsByLanguage = Object.fromEntries(
      Object.entries(this.flipcardWordsByLanguage).map(([language, words]) => [
        language,
        words.map(updateWord),
      ]),
    ) as Record<LearningLanguage, FlipcardWord[]>;
    this.flipcardAssets = this.flipcardAssets.map((asset) => (
      asset.conceptKey === response.conceptKey ? { ...asset, imageReported: response.imageReported } : asset
    ));
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

  private cancelSpellingAudioSetPolling(): void {
    if (this.spellingAudioSetPollToken) {
      this.spellingAudioSetPollToken.cancelled = true;
      this.spellingAudioSetPollToken = null;
    }
  }

  private cancelTranslationBackfillPolling(): void {
    Object.values(this.translationBackfillPollTokens).forEach((token) => {
      if (token) token.cancelled = true;
    });
    this.translationBackfillPollTokens = {};
  }

  private startSpellingAudioSetPolling(language: LearningLanguage = this.settingsLanguage): void {
    if (this.screen !== 'settings' || !this.isAdmin) return;
    if (!this.hasActiveSpellingAudioSetJobs(language)) return;
    if (this.spellingAudioSetPollToken) {
      if (this.spellingAudioSetPollToken.language === language) return;
      this.cancelSpellingAudioSetPolling();
    }

    const token: SpellingAudioSetPollToken = { cancelled: false, language };
    this.spellingAudioSetPollToken = token;
    void this.pollSpellingAudioSetStatuses(token);
  }

  private async pollSpellingAudioSetStatuses(token: SpellingAudioSetPollToken): Promise<void> {
    while (!token.cancelled && this.screen === 'settings') {
      await this.delay(2000);
      if (token.cancelled || this.screen !== 'settings') break;
      try {
        await this.loadSpellingAudioSetStatuses(token.language);
        if (token.language === this.settingsLanguage) {
          this.render();
        }
        if (!this.hasActiveSpellingAudioSetJobs(token.language)) break;
      } catch {
        if (!token.cancelled && this.screen === 'settings' && token.language === this.settingsLanguage) {
          this.spellingSetsError = 'Stav spelling audia se nepodařilo obnovit.';
          this.render();
        }
        break;
      }
    }
    if (this.spellingAudioSetPollToken === token) {
      this.spellingAudioSetPollToken = null;
    }
  }

  private hasActiveSpellingAudioSetJobs(language: LearningLanguage): boolean {
    return Object.values(this.spellingAudioSetStatusesByLanguage[language])
      .some((status) => status.status === 'queued' || status.status === 'generating');
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
      const settings = this.normalizedSettings();
      const savedSettings = await this.apiPatch<GameSettings>('settings', {
        secondsLimit: settings.secondsLimit,
        targetScore: settings.targetScore,
        celebrationTapLimit: settings.celebrationTapLimit,
        audioSource: settings.audioSource,
        flipcardSource: settings.flipcardSource,
        flipcardPromptLanguage: settings.flipcardPromptLanguage,
      } satisfies GameSettingsPatch);
      this.applySettings(savedSettings);
      this.settingsSaved = true;
    } catch {
      this.settingsError = 'Nastavení se nepodařilo uložit.';
    } finally {
      this.loading = false;
      this.render();
    }
  }

  async saveTestMenuVisibility(): Promise<void> {
    if (this.testMenuVisibilitySaving || !this.testMenuVisibilityDirty) return;
    this.testMenuVisibilitySaving = true;
    this.testMenuVisibilitySaved = false;
    this.testMenuVisibilityError = null;
    this.render();
    try {
      const savedSettings = await this.apiPatch<GameSettings>('settings', {
        hiddenTestMenuKeys: this.effectiveDraftTestMenuHiddenKeys(),
      } satisfies GameSettingsPatch);
      this.applySettings(savedSettings);
      await Promise.all([
        this.loadTestMenu(),
        this.loadTestMenuSettings(),
      ]);
      this.syncTestMenuVisibilityDraftFromSettings();
      this.testMenuVisibilitySaved = true;
    } catch {
      this.testMenuVisibilityError = 'Zobrazení testů se nepodařilo uložit.';
    } finally {
      this.testMenuVisibilitySaving = false;
      this.render();
    }
  }

  async saveCurrentSpellingSets(): Promise<void> {
    const language = this.settingsLanguage;
    this.spellingSetsSaved = false;
    this.spellingSetsError = null;
    this.cancelSpellingAudioSetPolling();
    this.loading = true;
    try {
      const sets = await this.apiPut<SpellingSet[]>(`spelling/sets?language=${language}`, {
        sets: this.spellingSetInputsByLanguage[language],
        latestSetIndex: this.latestSpellingSetIndexByLanguage[language],
      });
      this.spellingSetsByLanguage = {
        ...this.spellingSetsByLanguage,
        [language]: sets,
      };
      this.spellingSetInputsByLanguage = {
        ...this.spellingSetInputsByLanguage,
        [language]: sets.length > 0 ? sets.map((set) => set.rawWords) : [''],
      };
      const latestIndex = sets.findIndex((set) => set.isLatest);
      this.latestSpellingSetIndexByLanguage = {
        ...this.latestSpellingSetIndexByLanguage,
        [language]: latestIndex >= 0 ? latestIndex : this.lastConfiguredSpellingSetIndex(language),
      };
      await this.loadSpellingAudioSetStatuses(language);
      this.startSpellingAudioSetPolling(language);
      this.spellingSetsSaved = true;
    } catch {
      this.spellingSetsError = 'Spelling seznamy se nepodařilo uložit.';
    } finally {
      this.loading = false;
      this.render();
    }
  }

  async generateMissingSpellingAudio(setId: number): Promise<void> {
    if (this.spellingAudioSetActionDisabled(setId)) return;
    const language = this.settingsLanguage;
    this.spellingAudioSetGenerating = { ...this.spellingAudioSetGenerating, [setId]: true };
    const { [setId]: _removedError, ...nextErrors } = this.spellingAudioSetErrors;
    this.spellingAudioSetErrors = nextErrors;
    this.render();
    try {
      const status = await this.apiPost<SpellingAudioSetStatus>(
        `spelling/audio/sets/${setId}/missing?language=${language}`,
        {},
      );
      this.applySpellingAudioSetStatus(status);
      this.startSpellingAudioSetPolling(language);
    } catch (error) {
      this.spellingAudioSetErrors = {
        ...this.spellingAudioSetErrors,
        [setId]: error instanceof Error ? error.message : 'Audio se nepodařilo přidat do fronty.',
      };
    } finally {
      const { [setId]: _removedGenerating, ...nextGenerating } = this.spellingAudioSetGenerating;
      this.spellingAudioSetGenerating = nextGenerating;
      this.render();
    }
  }

  async saveCurrentFlipcardWords(): Promise<void> {
    const language = this.settingsLanguage;
    this.flipcardWordsSaved = false;
    this.flipcardWordsError = null;
    this.loading = true;
    try {
      const response = await this.apiPut<FlipcardWordsResponse>(
        `flipcards/words?language=${language}`,
        this.flipcardWordsRequest(language),
      );
      this.flipcardWordInputByLanguage = {
        ...this.flipcardWordInputByLanguage,
        [language]: response.words,
      };
      this.flipcardWordsByLanguage = {
        ...this.flipcardWordsByLanguage,
        [language]: response.items ?? [],
      };
      if (language !== 'en') {
        await this.loadTranslationBackfillStatus(language);
      }
      this.flipcardWordsSaved = true;
    } catch (error) {
      this.flipcardWordsError = error instanceof Error && error.message === 'flipcard_translation_count_mismatch'
        ? `Počet slov musí být stejný jako počet anglických konceptů (${this.flipcardWordsByLanguage.en.length}). Uložení zastaveno, aby se překlady neposunuly.`
        : 'Flipcards slovíčka se nepodařilo uložit.';
    } finally {
      this.loading = false;
      this.render();
    }
  }

  async syncFlipcardsFromSpelling(): Promise<void> {
    if (this.flipcardSpellingSyncLoading) return;
    const language = this.settingsLanguage;
    this.flipcardSpellingSyncLoading = true;
    this.flipcardSpellingSyncResult = null;
    this.flipcardSpellingSyncError = null;
    this.flipcardWordsSaved = false;
    this.flipcardWordsError = null;
    this.render();
    try {
      const result = await this.apiPost<FlipcardSpellingSyncResponse>(
        `flipcards/words/sync-from-spelling?language=${language}`,
        {},
      );
      this.flipcardSpellingSyncResult = result;
      await this.loadFlipcardWords(language);
      if (this.screen === 'assetLibrary' && this.assetLibraryLanguage === language) {
        await this.loadFlipcardAssets(language);
      }
    } catch (error) {
      this.flipcardSpellingSyncError = error instanceof Error ? error.message : 'Sync ze spellingu se nepodařilo spustit.';
    } finally {
      this.flipcardSpellingSyncLoading = false;
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
    this.spellingImageLoaded = false;
    this.spellingImageError = null;
    this.flipcardPromptAudioToken += 1;
    this.spellingPendingIndices = [];
    this.spellingStats = {};
    this.flipcardStats = {};
    this.audioPrepItems = [];
    this.audioPrepError = null;
    this.backendAudioUrls = {};
    this.backendSpellingAudioUrls = {};
    this.flipcardImageUrls = {};
    this.flipcardAdvancing = false;
    this.clearFlipcardPreloads();
    this.testMenuPath = [];
    this.setScreen(this.testMenuRoot?.children.length ? 'start' : 'settings');
    this.render();
  }

  private async loadGameData(): Promise<void> {
    this.loading = true;
    try {
      const auth = await this.apiGet<AuthStatusResponse>('auth/status');
      if (!auth.authenticated) {
        await this.loadAuthProviders();
        this.currentUser = null;
        this.profileMenuVisible = false;
        this.testMenuRoot = null;
        this.testMenuSettingsRoot = null;
        this.testMenuPath = [];
        this.selectedTest = null;
        this.selectedMode = null;
        this.questions = [];
        this.serverStats = emptyStatsByDirection();
        this.spellingWords = [];
        this.flipcardWords = [];
        this.flipcardQueue = [];
        this.spellingPendingIndices = [];
        this.spellingStats = {};
        this.flipcardStats = {};
        this.setScreen('login');
        return;
      }
      this.currentUser = auth.user ?? null;
      this.profileMenuVisible = false;
      const [testMenu, settings] = await Promise.all([
        this.apiGet<TestMenuNode>('test-menu'),
        this.apiGet<GameSettings>('settings'),
        this.isAdmin ? this.loadAllLanguageSettings() : Promise.resolve(),
      ]);
      this.applySettings(settings);
      this.testMenuRoot = normalizeTestMenuNode(testMenu);
      this.testMenuSettingsRoot = null;
      this.testMenuPath = [];
      this.selectedTest = null;
      this.selectedMode = null;
      this.questions = [];
      this.serverStats = emptyStatsByDirection();
      this.spellingWords = [];
      this.flipcardWords = [];
      this.flipcardQueue = [];
      this.spellingPendingIndices = [];
      this.spellingStats = {};
      this.flipcardStats = {};
      this.setScreen(this.testMenuRoot.children.length > 0 ? 'start' : 'settings');
    } catch {
      await this.loadAuthProviders();
      this.currentUser = null;
      this.setScreen('login');
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private async loadSettings(): Promise<void> {
    this.applySettings(await this.apiGet<GameSettings>('settings'));
    this.syncTestMenuVisibilityDraftFromSettings();
  }

  private async loadTestMenu(): Promise<void> {
    this.testMenuRoot = normalizeTestMenuNode(await this.apiGet<TestMenuNode>('test-menu'));
    this.testMenuPath = this.validTestMenuPath(this.testMenuPath);
  }

  private async loadTestMenuSettings(): Promise<void> {
    this.testMenuSettingsRoot = normalizeTestMenuNode(await this.apiGet<TestMenuNode>('test-menu?includeHidden=true'));
    this.syncTestMenuVisibilityDraftFromSettings();
  }

  private async loadAuthProviders(): Promise<void> {
    try {
      const providers = await this.apiGet<AuthProvidersResponse>('auth/providers', false);
      this.googleLoginConfigured = providers.googleConfigured;
      this.passwordLoginConfigured = providers.passwordLoginConfigured;
    } catch {
      this.googleLoginConfigured = true;
      this.passwordLoginConfigured = false;
    }
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
      celebrationTapLimit: Math.max(0, Math.floor(Number(this.settings.celebrationTapLimit) || 0)),
      audioSource: this.settings.audioSource === 'backend_mp3' ? 'backend_mp3' : 'browser_tts',
      flipcardSource: this.settings.flipcardSource === 'ready_only' ? 'ready_only' : 'all_words',
      flipcardPromptLanguage: this.normalizedLearningLanguage(this.settings.flipcardPromptLanguage, 'cs'),
      hiddenTestMenuKeys: this.normalizedHiddenTestMenuKeys(this.settings.hiddenTestMenuKeys),
    };
  }

  private applySettings(settings: GameSettings): void {
    const wasTeslaMp3AudioModeActive = this.teslaMp3AudioModeActive;
    const celebrationTapLimit = Math.floor(Number(settings.celebrationTapLimit));
    this.settings = {
      secondsLimit: Math.max(1, Math.floor(Number(settings.secondsLimit) || 30)),
      targetScore: Math.max(1, Math.floor(Number(settings.targetScore) || 10)),
      celebrationTapLimit: Number.isFinite(celebrationTapLimit) ? Math.max(0, celebrationTapLimit) : 100,
      audioSource: settings.audioSource === 'backend_mp3' ? 'backend_mp3' : 'browser_tts',
      flipcardSource: settings.flipcardSource === 'ready_only' ? 'ready_only' : 'all_words',
      flipcardPromptLanguage: this.normalizedLearningLanguage(settings.flipcardPromptLanguage, 'cs'),
      hiddenTestMenuKeys: this.normalizedHiddenTestMenuKeys(settings.hiddenTestMenuKeys),
    };
    this.secondsLeft = this.settings.secondsLimit;
    if (wasTeslaMp3AudioModeActive && !this.teslaMp3AudioModeActive) {
      this.destroyTeslaMp3Audio();
      this.destroyTeslaMp3TestAudio();
    }
  }

  private normalizedLearningLanguage(language: LearningLanguage | null | undefined, fallback: LearningLanguage): LearningLanguage {
    return this.languageOptions.find((option) => option.code === language)?.code ?? fallback;
  }

  isTestMenuNodeVisible(node: TestMenuNode): boolean {
    return !this.effectiveDraftTestMenuHiddenKeys().includes(node.key);
  }

  toggleTestMenuNodeVisibility(node: TestMenuNode, event: Event): void {
    const checked = (event.target as HTMLInputElement | null)?.checked ?? true;
    const hidden = new Set(this.testMenuVisibilityDraftKeys);
    const affectedKeys = this.collectTestMenuNodeKeys(node);
    if (checked) {
      affectedKeys.forEach((key) => hidden.delete(key));
    } else {
      affectedKeys.forEach((key) => hidden.add(key));
    }
    this.testMenuVisibilityDraftKeys = this.normalizeTestMenuVisibilityKeys([...hidden]);
    this.testMenuVisibilitySaved = false;
    this.testMenuVisibilityError = null;
  }

  testMenuVisibilityDetail(node: TestMenuNode): string {
    if (node.launchable) return 'test';
    if (node.children.length === 0) return 'prázdná větev';
    return `${node.children.length} položek`;
  }

  private normalizedHiddenTestMenuKeys(keys: string[] | null | undefined): string[] {
    return Array.from(new Set((keys ?? []).map((key) => String(key).trim()).filter(Boolean))).sort();
  }

  private syncTestMenuVisibilityDraftFromSettings(): void {
    this.testMenuVisibilityDraftKeys = this.effectiveSavedTestMenuHiddenKeys();
  }

  private effectiveSavedTestMenuHiddenKeys(): string[] {
    return this.normalizeTestMenuVisibilityKeys(this.settings.hiddenTestMenuKeys);
  }

  private effectiveDraftTestMenuHiddenKeys(): string[] {
    return this.normalizeTestMenuVisibilityKeys(this.testMenuVisibilityDraftKeys);
  }

  private normalizeTestMenuVisibilityKeys(keys: string[] | null | undefined): string[] {
    const normalized = this.normalizedHiddenTestMenuKeys(keys);
    return this.testMenuSettingsRoot ? this.cascadeHiddenTestMenuKeys(normalized, this.testMenuSettingsRoot) : normalized;
  }

  private cascadeHiddenTestMenuKeys(keys: string[], root: TestMenuNode): string[] {
    const hidden = new Set(this.normalizedHiddenTestMenuKeys(keys));
    const visit = (node: TestMenuNode, parentHidden: boolean): void => {
      const nodeHidden = parentHidden || hidden.has(node.key);
      if (nodeHidden) {
        hidden.add(node.key);
      }
      node.children.forEach((child) => visit(child, nodeHidden));
    };
    visit(root, false);
    return this.normalizedHiddenTestMenuKeys([...hidden]);
  }

  private collectTestMenuNodeKeys(node: TestMenuNode): string[] {
    return [node.key, ...node.children.flatMap((child) => this.collectTestMenuNodeKeys(child))];
  }

  private validTestMenuPath(path: string[]): string[] {
    const validPath: string[] = [];
    let node = this.testMenuRoot;
    for (const key of path) {
      const next = node?.children.find((child) => child.key === key);
      if (!next) break;
      validPath.push(key);
      node = next;
    }
    return validPath;
  }

  private startSpellingGame(): void {
    this.setScreen('play');
    if (this.settings.audioSource === 'browser_tts') {
      this.checkTtsSupport();
    } else {
      this.ttsDetailsVisible = false;
      void this.startTeslaMp3AudioForTest();
    }
    this.pickQuestion();
  }

  private startMathSession(): void {
    const candidates = this.questions.map((question, index) => {
      const direction = this.pickDirection();
      return {
        key: `${direction}:${question.id}`,
        value: { index, direction },
        weight: statsWeight(this.serverStats[direction][String(question.id)]),
      };
    });
    this.mathSession.start(candidates, this.settings.targetScore);
    this.score = this.mathSession.completedCount;
  }

  private startSpellingSession(): void {
    this.spellingSession.start(
      this.spellingWords.map((word, index) => ({
        key: word.normalized,
        value: index,
        weight: statsWeight(this.spellingStats[word.normalized]),
      })),
      this.settings.targetScore,
    );
    this.score = this.spellingSession.completedCount;
  }

  private startFlipcardSession(): void {
    this.flipcardSession.start(
      this.flipcardWords.map((word, index) => ({
        key: word.normalized,
        value: index,
        weight: statsWeight(this.flipcardStats[word.normalized]),
      })),
      this.settings.targetScore,
    );
    this.score = this.flipcardSession.completedCount;
  }

  private startFlipcardGame(): void {
    this.setScreen('play');
    if (this.settings.audioSource === 'browser_tts') {
      this.checkTtsSupport();
    } else {
      this.ttsDetailsVisible = false;
      void this.startTeslaMp3AudioForTest();
    }
    this.pickQuestion();
  }

  private async prepareSpellingAssets(): Promise<void> {
    this.audioPrepLoading = true;
    this.audioPrepError = null;
    this.backendAudioUrls = {};
    this.backendSpellingAudioUrls = {};
    this.flipcardImageUrls = {};
    try {
      const selectedWords = this.spellingSession.selectedValues()
        .map((index) => this.spellingWords[index])
        .filter((word): word is SpellingWord => Boolean(word));
      const imageItems: AudioPrepItem[] = selectedWords
        .filter((word) => Boolean(word.conceptKey))
        .map((word) => ({
          audioWord: word.conceptKey as string,
          normalized: word.conceptKey as string,
          word: word.text,
          language: this.selectedLanguage,
          kind: 'flipcard_image',
          status: 'pending',
          audioUrl: null,
          error: null,
        }));
      const audioItems: AudioPrepItem[] = this.settings.audioSource === 'backend_mp3'
        ? selectedWords.flatMap((word) => [
          {
            audioWord: word.text,
            normalized: word.normalized,
            word: word.text,
            language: this.selectedLanguage,
            kind: 'word' as const,
            status: 'pending' as const,
            audioUrl: null,
            error: null,
          },
          {
            audioWord: word.text,
            normalized: word.normalized,
            word: formatSpellingAnswer(word.text, this.selectedLanguage),
            language: this.selectedLanguage,
            kind: 'spelling' as const,
            status: 'pending' as const,
            audioUrl: null,
            error: null,
          },
        ])
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
      await this.preloadSpellingImages();
      this.audioPrepLoading = false;
      this.startSpellingGame();
    } catch (error) {
      this.setScreen('audioPrep');
      this.audioPrepError = error instanceof Error ? error.message : 'Test se nepodařilo připravit.';
    } finally {
      this.audioPrepLoading = false;
      this.render();
    }
  }

  private async prepareFlipcardAssets(): Promise<void> {
    this.audioPrepLoading = true;
    this.audioPrepError = null;
    this.backendAudioUrls = {};
    this.flipcardPromptAudioUrls = {};
    this.flipcardImageUrls = {};
    try {
      const selectedWords = this.flipcardSession.selectedValues()
        .map((index) => this.flipcardWords[index])
        .filter((word): word is FlipcardWord => Boolean(word));
      const imageItems: AudioPrepItem[] = selectedWords.map((word) => ({
            audioWord: word.conceptKey,
            normalized: word.conceptKey,
            word: word.text,
            language: this.selectedLanguage,
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
            language: this.selectedLanguage,
            kind: 'word',
            status: 'pending',
            audioUrl: null,
            error: null,
        }))
        : [];
      const promptAudioItems: AudioPrepItem[] = this.settings.audioSource === 'backend_mp3'
        ? selectedWords
            .map((word) => ({ answerWord: word, promptWord: this.flipcardPromptWordForConcept(word.conceptKey) }))
            .filter((item): item is { answerWord: FlipcardWord; promptWord: FlipcardWord } => Boolean(item.promptWord))
            .map(({ answerWord, promptWord }) => ({
              audioWord: promptWord.text,
              normalized: this.flipcardPromptAudioKey(answerWord.conceptKey),
              word: promptWord.text,
              language: this.settings.flipcardPromptLanguage,
              kind: 'word',
              status: 'pending',
              audioUrl: null,
              error: null,
            }))
        : [];
      this.audioPrepItems = [...imageItems, ...audioItems, ...promptAudioItems];

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
          .filter((item) => item.kind === 'word' && item.language === this.selectedLanguage && !this.isFlipcardPromptAudioItem(item) && item.audioUrl)
          .map((item) => [item.normalized, item.audioUrl as string]),
      );
      this.flipcardPromptAudioUrls = Object.fromEntries(
        this.audioPrepItems
          .filter((item) => this.isFlipcardPromptAudioItem(item) && item.audioUrl)
          .map((item) => [this.conceptKeyFromFlipcardPromptAudioKey(item.normalized), item.audioUrl as string]),
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
    const response = await this.apiGet<SpellingAudioWordResponse>(this.audioStatusPath(item.audioWord, item.kind, item.language));
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

  private async preloadSpellingImages(): Promise<void> {
    const urls = this.spellingSession.selectedValues()
      .map((index) => this.spellingWords[index]?.conceptKey ?? null)
      .map((conceptKey) => (conceptKey ? this.flipcardImageUrls[conceptKey] : null))
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
      const response = await this.apiPost<SpellingAudioWordResponse>(this.audioStatusPath(item.audioWord, item.kind, item.language), {});
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
        const response = await this.apiGet<SpellingAudioWordResponse>(this.audioStatusPath(item.audioWord, item.kind, item.language));
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
      if (this.isFlipcardPromptAudioItem(item)) {
        this.flipcardPromptAudioUrls = {
          ...this.flipcardPromptAudioUrls,
          [this.conceptKeyFromFlipcardPromptAudioKey(item.normalized)]: response.audioUrl,
        };
      } else if (response.kind === 'spelling') {
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
    return this.spellingAudioPathForLanguage(word, kind, this.selectedLanguage);
  }

  private spellingAudioPathForLanguage(word: string, kind: 'word' | 'spelling', language: LearningLanguage): string {
    return `spelling/audio/words/${encodeURIComponent(word)}?language=${language}&kind=${kind}`;
  }

  private flipcardAudioPath(word: string, language: LearningLanguage = this.selectedLanguage, force = false): string {
    const suffix = force ? '?force=true' : '';
    return `flipcards/audio/${language}/${encodeURIComponent(word)}${suffix}`;
  }

  private audioStatusPath(word: string, kind: 'word' | 'spelling', language: LearningLanguage = this.selectedLanguage): string {
    return this.activeGame === 'flipcards' && kind === 'word'
      ? this.flipcardAudioPath(word, language)
      : this.spellingAudioPathForLanguage(word, kind, language);
  }

  private flipcardImagePath(word: string, force = false): string {
    const suffix = force ? '?force=true' : '';
    return `flipcards/images/${encodeURIComponent(word)}${suffix}`;
  }

  private assetTranslationInfoKeyFor(asset: FlipcardAsset): string {
    return `${asset.language}:${asset.conceptKey}`;
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

  private ttsLanguage(language: LearningLanguage = this.selectedLanguage): string {
    return this.languageOptions.find((option) => option.code === language)?.ttsLang ?? 'en-US';
  }

  private async delay(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
  }

  private setScreen(screen: Screen): void {
    if (this.screen !== 'finished' && screen === 'finished') {
      this.celebrationTapCount = 0;
      this.celebrationTap = null;
      this.celebrationPosition = { offsetX: 0, offsetY: 0 };
    }
    if (this.screen === 'finished' && screen !== 'finished') {
      this.clearCelebrationTapTimer();
      this.celebrationTap = null;
      this.celebrationTapCount = 0;
      this.celebrationPosition = { offsetX: 0, offsetY: 0 };
    }
    if (this.screen === 'play' && screen !== 'play') {
      this.clearSpellingAnswerWordActive();
    }
    if (this.screen === 'assetLibrary' && screen !== 'assetLibrary') {
      this.cancelAssetLibraryPolling();
    }
    if (this.screen === 'audioPrep' && screen !== 'audioPrep') {
      this.cancelAudioPrepPolling();
    }
    if (this.screen === 'settings' && screen !== 'settings') {
      this.cancelSpellingAudioSetPolling();
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
      this.setScreen('play');
      return;
    }

    const nextItem = this.mathSession.next();
    if (!nextItem) {
      void this.finishSession();
      return;
    }

    this.currentIndex = nextItem.index;
    this.currentDirection = nextItem.direction;
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
    const nextIndex = this.spellingSession.next();
    if (nextIndex === null) {
      void this.finishSession();
      return;
    }
    this.spellingWordIndex = nextIndex;
    this.spellingImageLoaded = false;
    this.spellingImageError = null;
    this.answerVisible = false;
    this.timedOut = false;
    this.secondsLeft = this.settings.secondsLimit;
    this.startTimer();
    this.render();
    window.setTimeout(() => this.playCurrentSpellingAudio(), 120);
  }

  private pickFlipcardWord(): void {
    if (this.flipcardWords.length < 3) {
      this.flipcardWordIndex = null;
      return;
    }
    const nextIndex = this.flipcardSession.next();
    if (nextIndex === null) {
      void this.finishSession();
      return;
    }
    this.flipcardWordIndex = nextIndex;
    this.flipcardAttemptFailed = false;
    this.flipcardImageLoaded = false;
    this.flipcardImageError = null;
    this.spellingImageLoaded = false;
    this.spellingImageError = null;
    this.flipcardPromptAudioToken += 1;
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
    this.flipcardSession.selectedValues()
      .map((index) => this.flipcardOptionsByIndex[index] ?? [])
      .flat()
      .forEach((option) => {
        words.set(option.word.normalized, option.word);
      });
    return Array.from(words.values());
  }

  private flipcardPromptWordForConcept(conceptKey: string): FlipcardWord | null {
    return this.flipcardWordsByLanguage[this.settings.flipcardPromptLanguage]
      .find((word) => word.conceptKey === conceptKey)
      ?? null;
  }

  private flipcardPromptAudioKey(conceptKey: string): string {
    return `prompt:${conceptKey}`;
  }

  private isFlipcardPromptAudioItem(item: AudioPrepItem): boolean {
    return item.kind === 'word' && item.normalized.startsWith('prompt:');
  }

  private conceptKeyFromFlipcardPromptAudioKey(key: string): string {
    return key.startsWith('prompt:') ? key.slice('prompt:'.length) : key;
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
      this.flipcardSession.record('wrong');
      this.score = this.flipcardSession.completedCount;
      this.flipcardAdvancing = false;
      this.showPenalty();
      this.pickQuestion();
      return;
    }

    await this.playFlipcardWordAudio(option.word);
    this.flipcardSession.record('correct');
    this.score = this.flipcardSession.completedCount;
    if (this.flipcardSession.finished) {
      this.flipcardAdvancing = false;
      await this.finishSession();
      return;
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
    const promptAudioToken = this.flipcardPromptAudioToken;
    window.setTimeout(() => {
      if (this.flipcardPromptAudioToken !== promptAudioToken) return;
      void this.playCurrentFlipcardPromptAudio();
    }, 120);
  }

  onFlipcardImageError(): void {
    this.clearTimer();
    this.flipcardImageLoaded = false;
    this.flipcardImageError = 'Obrázek se nepodařilo načíst.';
    this.render();
  }

  onSpellingImageLoad(): void {
    if (this.activeGame !== 'spelling' || this.spellingWordIndex === null) return;
    this.spellingImageLoaded = true;
    this.spellingImageError = null;
    this.render();
  }

  onSpellingImageError(): void {
    if (this.activeGame !== 'spelling' || this.spellingWordIndex === null) return;
    this.spellingImageLoaded = false;
    this.spellingImageError = 'Obrázek se nepodařilo načíst.';
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
    this.recordSessionOutcome('wrong');
    this.score = this.currentSessionCompletedCount();
    this.showPenalty();
    this.render();
  }

  private async handleFlipcardTimeout(index: number): Promise<void> {
    this.timedOut = true;
    this.flipcardAdvancing = true;
    this.flipcardSession.record('wrong');
    this.score = this.flipcardSession.completedCount;
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

  private recordSessionOutcome(outcome: TestSessionOutcome): void {
    if (this.activeGame === 'spelling') {
      this.spellingSession.record(outcome);
      return;
    }
    if (this.activeGame === 'flipcards') {
      this.flipcardSession.record(outcome);
      return;
    }
    this.mathSession.record(outcome);
  }

  private currentSessionCompletedCount(): number {
    if (this.activeGame === 'spelling') return this.spellingSession.completedCount;
    if (this.activeGame === 'flipcards') return this.flipcardSession.completedCount;
    return this.mathSession.completedCount;
  }

  private currentSessionFinished(): boolean {
    if (this.activeGame === 'spelling') return this.spellingSession.finished;
    if (this.activeGame === 'flipcards') return this.flipcardSession.finished;
    return this.mathSession.finished;
  }

  private async finishSession(): Promise<void> {
    if (this.finishingSession) return;
    this.finishingSession = true;
    this.clearTimer();
    try {
      await this.saveCurrentSessionResults();
    } catch {
      // The child already completed the test; a transient save failure should not trap them on the last card.
    }
    try {
      const response = await this.apiPost<TrophyAwardResponse>('trophies/award-next', {});
      this.trophies = response.trophies;
      this.surprise = this.trophyToSurprise(response.awarded);
    } catch {
      // Trophy selection is celebratory only; keep the congratulations screen available even if saving fails.
      this.surprise = this.nextFallbackSurprise();
    }
    this.setScreen('finished');
    this.render();
  }

  private async saveCurrentSessionResults(): Promise<void> {
    if (this.activeGame === 'spelling') {
      await this.saveSpellingSessionResults();
      return;
    }
    if (this.activeGame === 'flipcards') {
      await this.saveFlipcardSessionResults();
      return;
    }
    await this.saveMathSessionResults();
  }

  private async saveMathSessionResults(): Promise<void> {
    const test = this.selectedTest;
    if (!test) return;
    const results: MathSessionSaveResult[] = this.mathSession.results().flatMap((result) => {
      const [direction, rawQuestionId] = result.key.split(':');
      const questionId = Number(rawQuestionId);
      if (!Number.isFinite(questionId)) return [];
      return [{
        questionId,
        direction: direction === 'factors_to_product' ? 'factors_to_product' : 'product_to_factors',
        correct: !result.hadMistake,
      }];
    });
    if (results.length === 0) return;
    const byDirection = await this.apiPost<Record<PracticeDirection, QuestionStatsSnapshot>>(
      `tests/${test.id}/stats/session`,
      { results } satisfies MathSessionSaveRequest,
    );
    this.serverStats = {
      product_to_factors: byDirection.product_to_factors?.statsByQuestionId ?? this.serverStats.product_to_factors,
      factors_to_product: byDirection.factors_to_product?.statsByQuestionId ?? this.serverStats.factors_to_product,
    };
  }

  private async saveSpellingSessionResults(): Promise<void> {
    const results: WordSessionSaveResult[] = this.spellingSession.results().map((result) => ({
      word: result.key,
      correct: !result.hadMistake,
    }));
    if (results.length === 0) return;
    const response = await this.apiPost<SpellingStatsSnapshot>(
      `spelling/stats/session?language=${this.selectedLanguage}`,
      { results } satisfies WordSessionSaveRequest,
    );
    this.spellingStats = response.statsByWord ?? this.spellingStats;
  }

  private async saveFlipcardSessionResults(): Promise<void> {
    const results: WordSessionSaveResult[] = this.flipcardSession.results().map((result) => ({
      word: result.key,
      correct: !result.hadMistake,
    }));
    if (results.length === 0) return;
    const response = await this.apiPost<FlipcardStatsSnapshot>(
      `flipcards/stats/session?language=${this.selectedLanguage}`,
      { results } satisfies WordSessionSaveRequest,
    );
    this.flipcardStats = response.statsByWord ?? this.flipcardStats;
  }

  private resetRoundState(): void {
    this.cancelAssetLibraryPolling();
    this.cancelAudioPrepPolling();
    this.clearTimer();
    this.spellingAudioSequenceToken += 1;
    this.clearSpellingAnswerWordActive();
    this.stopBackendAudio();
    this.destroyTeslaMp3Audio();
    this.destroyTeslaMp3TestAudio();
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
    this.spellingImageLoaded = false;
    this.spellingImageError = null;
    this.flipcardPromptAudioToken += 1;
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
    this.finishingSession = false;
    this.mathSession.clear();
    this.spellingSession.clear();
    this.flipcardSession.clear();
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

  private async loadAllLanguageSettings(): Promise<void> {
    await Promise.all(this.languageOptions.flatMap((language) => [
      this.loadSpellingSets(language.code),
      this.loadSpellingAudioSetStatuses(language.code),
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
    this.spellingSetsByLanguage = {
      ...this.spellingSetsByLanguage,
      [language]: sets,
    };
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

  private async loadSpellingAudioSetStatuses(language: LearningLanguage = this.settingsLanguage): Promise<void> {
    const response = await this.apiGet<SpellingAudioSetStatusResponse>(`spelling/audio/sets?language=${language}`);
    this.spellingAudioSetStatusesByLanguage = {
      ...this.spellingAudioSetStatusesByLanguage,
      [language]: Object.fromEntries(response.items.map((item) => [item.setId, item])) as Record<number, SpellingAudioSetStatus>,
    };
  }

  private applySpellingAudioSetStatus(status: SpellingAudioSetStatus): void {
    this.spellingAudioSetStatusesByLanguage = {
      ...this.spellingAudioSetStatusesByLanguage,
      [status.language]: {
        ...this.spellingAudioSetStatusesByLanguage[status.language],
        [status.setId]: status,
      },
    };
  }

  private async loadFlipcardWords(language: LearningLanguage = this.settingsLanguage): Promise<void> {
    const response = await this.apiGet<FlipcardWordsResponse>(`flipcards/words?language=${language}`);
    this.flipcardWordInputByLanguage = {
      ...this.flipcardWordInputByLanguage,
      [language]: response.words,
    };
    this.flipcardWordsByLanguage = {
      ...this.flipcardWordsByLanguage,
      [language]: response.items ?? [],
    };
  }

  private flipcardWordsRequest(language: LearningLanguage): FlipcardWordsRequest {
    const words = this.flipcardWordInputByLanguage[language] ?? '';
    if (language === 'en') return { words };

    const conceptItems = this.flipcardWordsByLanguage.en ?? [];
    if (conceptItems.length === 0) throw new Error('flipcard_translation_concepts_missing');

    const parsedWords = this.parseDelimitedWords(words);
    if (parsedWords.length !== conceptItems.length) {
      throw new Error('flipcard_translation_count_mismatch');
    }
    return {
      items: conceptItems.map((item, index) => ({
        conceptKey: item.conceptKey,
        word: parsedWords[index] ?? '',
      })),
    };
  }

  private parseDelimitedWords(words: string): string[] {
    return words
      .split(',')
      .map((word) => word.trim())
      .filter((word) => word.length > 0);
  }

  private async loadFlipcardAssets(language: LearningLanguage = this.assetLibraryLanguage): Promise<void> {
    const response = await this.apiGet<FlipcardAssetsResponse>(`flipcards/assets?language=${language}`);
    if (this.screen === 'assetLibrary' && this.assetLibraryLanguage !== language) return;
    this.flipcardAssets = response.items ?? [];
  }

  private async loadAudioTtsSettings(language: LearningLanguage = this.assetLibraryLanguage): Promise<void> {
    this.audioTtsSettingsLoading = true;
    this.audioTtsSettingsError = null;
    try {
      const response = await this.apiGet<AudioTtsSettingsResponse>(`flipcards/audio-settings?language=${language}`);
      if (this.screen === 'assetLibrary' && this.assetLibraryLanguage !== language) return;
      this.applyAudioTtsSettings(response);
    } catch (error) {
      if (this.screen === 'assetLibrary' && this.assetLibraryLanguage === language) {
        this.audioTtsSettingsError = error instanceof Error ? error.message : 'TTS nastavení se nepodařilo načíst.';
      }
    } finally {
      if (this.screen === 'assetLibrary' && this.assetLibraryLanguage === language) {
        this.audioTtsSettingsLoading = false;
      }
    }
  }

  private applyAudioTtsSettings(response: AudioTtsSettingsResponse): void {
    this.audioTtsDraftsByLanguage = {
      ...this.audioTtsDraftsByLanguage,
      [response.language]: {
        voice: response.voice,
        instructions: response.instructions,
        testWord: response.testWord || 'test',
        voices: response.voices.length > 0 ? response.voices : OPENAI_TTS_VOICES,
      },
    };
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
    void this.playCurrentSpellingWordAudio();
  }

  private playCurrentSpellingLettersAudio(): void {
    void this.playCurrentSpellingAnswerThenWord();
  }

  private async playCurrentSpellingWordAudio(): Promise<void> {
    const token = this.nextSpellingAudioSequenceToken();
    if (this.settings.audioSource === 'backend_mp3') {
      await this.playCurrentBackendAudio(token);
      return;
    }
    const word = this.currentSpellingWord?.text;
    if (!word) return;
    await this.speakText(word, 0.86, 'Prehrani TTS skoncilo chybou.', 'Prehrani TTS selhalo.');
  }

  private async playCurrentSpellingAnswerThenWord(): Promise<void> {
    const token = this.nextSpellingAudioSequenceToken();
    const word = this.currentSpellingWord;
    if (!word) return;
    if (this.settings.audioSource === 'backend_mp3') {
      await this.playCurrentBackendSpellingAudio(token);
      if (!this.spellingAudioSequenceStillCurrent(token, word.normalized)) return;
      await this.playCurrentBackendAudio(token);
      return;
    }
    await this.speakText(
      formatSpellingSpeech(word.text, this.selectedLanguage),
      0.82,
      'Prehrani spelling TTS skoncilo chybou.',
      'Prehrani spelling TTS selhalo.',
    );
    if (!this.spellingAudioSequenceStillCurrent(token, word.normalized)) return;
    await this.speakText(word.text, 0.86, 'Prehrani TTS skoncilo chybou.', 'Prehrani TTS selhalo.');
  }

  private async playCurrentBackendAudio(token = this.spellingAudioSequenceToken): Promise<void> {
    const word = this.currentSpellingWord;
    if (!word) return;
    const audioUrl = this.backendAudioUrls[word.normalized];
    if (!audioUrl) return;
    await this.playBackendAudioUrl(audioUrl);
    if (!this.spellingAudioSequenceStillCurrent(token, word.normalized)) return;
  }

  private async playCurrentBackendSpellingAudio(token = this.spellingAudioSequenceToken): Promise<void> {
    const word = this.currentSpellingWord;
    if (!word) return;
    const audioUrl = this.backendSpellingAudioUrls[word.normalized];
    if (!audioUrl) return;
    await this.playBackendAudioUrl(audioUrl);
  }

  private nextSpellingAudioSequenceToken(): number {
    this.clearSpellingAnswerWordActive();
    this.spellingAudioSequenceToken += 1;
    return this.spellingAudioSequenceToken;
  }

  private spellingAudioSequenceStillCurrent(token: number, normalized: string): boolean {
    return this.spellingAudioSequenceToken === token
      && this.currentSpellingWord?.normalized === normalized
      && this.activeGame === 'spelling';
  }

  private setSpellingAnswerWordActive(active: boolean): void {
    this.clearSpellingAnswerWordTimer();
    if (this.spellingAnswerWordActive === active) return;
    this.spellingAnswerWordActive = active;
    this.render();
  }

  private clearSpellingAnswerWordActive(): void {
    this.clearSpellingAnswerWordTimer();
    const wasActive = this.spellingAnswerWordActive;
    this.spellingAnswerWordActive = false;
    if (wasActive) {
      this.render();
    }
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
      const promptAudioKey = this.flipcardPromptAudioKey(word.conceptKey);
      const promptAudioUrl = this.flipcardPromptAudioUrls[word.conceptKey];
      keep.add(promptAudioKey);
      if (this.settings.audioSource === 'backend_mp3' && promptAudioUrl && !this.flipcardAudioPreloads.has(promptAudioKey)) {
        const audio = new Audio(promptAudioUrl);
        audio.preload = 'auto';
        audio.load();
        this.flipcardAudioPreloads.set(promptAudioKey, audio);
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
    return this.flipcardSession.selectedValues().find((index) => index !== this.flipcardWordIndex) ?? null;
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

  async playCurrentFlipcardPromptAudio(): Promise<void> {
    const current = this.currentFlipcardWord;
    const prompt = this.currentFlipcardPromptWord;
    if (!current || !prompt || !this.flipcardImageLoaded || this.flipcardImageError !== null) return;
    if (this.settings.audioSource === 'backend_mp3') {
      const audioUrl = this.flipcardPromptAudioUrls[current.conceptKey];
      if (!audioUrl) return;
      await this.playBackendAudioUrl(audioUrl);
      return;
    }
    await this.speakText(
      prompt.text,
      0.86,
      'Prehrani TTS skoncilo chybou.',
      'Prehrani TTS selhalo.',
      this.settings.flipcardPromptLanguage,
    );
  }

  private getTeslaMp3Audio(): TeslaMp3AudioController {
    if (this.teslaMp3Audio === null) {
      this.teslaMp3Audio = new TeslaMp3AudioController(
        (state) => this.updateTeslaMp3PlayerState(state),
        this.teslaMp3LoopMode,
      );
    }
    return this.teslaMp3Audio;
  }

  private async startTeslaMp3AudioForTest(): Promise<void> {
    if (!this.teslaMp3AudioModeActive) return;
    this.destroyTeslaMp3TestAudio();
    try {
      await this.getTeslaMp3Audio().startLoop();
    } catch {
      // The next MP3 playback attempt will try to start the loop again.
    }
  }

  private stopTeslaMp3AudioForTest(): void {
    this.stopBackendAudio();
    this.destroyTeslaMp3Audio();
    this.destroyTeslaMp3TestAudio();
  }

  private destroyTeslaMp3Audio(): void {
    this.teslaMp3Audio?.destroy();
    this.teslaMp3Audio = null;
    this.updateTeslaMp3PlayerState(this.teslaMp3AudioModeActive ? 'idle' : 'off');
  }

  private canRunTeslaMp3VariantTest(): boolean {
    if (!this.teslaMp3AudioEnabled) return false;
    if (this.settings.audioSource === 'backend_mp3') return true;
    this.teslaMp3TestStatus = 'Pro test přepni Audio na Serverové MP3.';
    this.render();
    return false;
  }

  private async startTeslaMp3VariantLoop(mode: TeslaMp3LoopMode): Promise<TeslaMp3AudioController> {
    this.destroyTeslaMp3Audio();
    for (const [activeMode, controller] of this.teslaMp3TestAudio.entries()) {
      if (activeMode !== mode) {
        controller.destroy();
        this.teslaMp3TestAudio.delete(activeMode);
      }
    }
    const controller = this.getTeslaMp3TestController(mode);
    this.teslaMp3TestActiveMode = mode;
    await controller.startLoop();
    return controller;
  }

  private getTeslaMp3TestController(mode: TeslaMp3LoopMode): TeslaMp3AudioController {
    const existing = this.teslaMp3TestAudio.get(mode);
    if (existing) return existing;
    const controller = new TeslaMp3AudioController(
      (state) => {
        if (this.teslaMp3TestActiveMode === mode) {
          this.updateTeslaMp3PlayerState(state);
        }
      },
      mode,
    );
    this.teslaMp3TestAudio.set(mode, controller);
    return controller;
  }

  private stopTeslaMp3TestController(mode: TeslaMp3LoopMode): void {
    const controller = this.teslaMp3TestAudio.get(mode);
    controller?.destroy();
    this.teslaMp3TestAudio.delete(mode);
    if (this.teslaMp3TestActiveMode === mode) {
      this.teslaMp3TestActiveMode = null;
      this.updateTeslaMp3PlayerState(this.teslaMp3AudioModeActive ? 'idle' : 'off');
    }
    if (this.teslaMp3TestBusyMode === mode) {
      this.teslaMp3TestBusyMode = null;
    }
  }

  private destroyTeslaMp3TestAudio(): void {
    for (const controller of this.teslaMp3TestAudio.values()) {
      controller.destroy();
    }
    this.teslaMp3TestAudio.clear();
    this.teslaMp3TestActiveMode = null;
    this.teslaMp3TestBusyMode = null;
    this.teslaMp3TestStatus = null;
    this.updateTeslaMp3PlayerState(this.teslaMp3AudioModeActive ? 'idle' : 'off');
  }

  private async resolveTeslaMp3TestAudioUrl(): Promise<string> {
    const language = this.settingsLanguage;
    const word = this.teslaMp3TestWordForLanguage(language);
    const cacheKey = `${language}:${word}`;
    const cached = this.teslaMp3TestAudioUrls.get(cacheKey);
    if (cached) return cached;

    const path = this.spellingAudioPathForLanguage(word, 'word', language);
    let response = await this.apiGet<SpellingAudioWordResponse>(path);
    if (response.status !== 'ready' || !response.audioUrl) {
      response = await this.apiPost<SpellingAudioWordResponse>(path, {});
    }

    const startedAt = Date.now();
    while (response.status !== 'ready' || !response.audioUrl) {
      if (response.status === 'error') throw new Error(response.error ?? 'Generování testovacího audia selhalo.');
      if (Date.now() - startedAt > TESLA_MP3_TEST_POLL_TIMEOUT_MS) {
        throw new Error('Testovací audio se nepodařilo připravit včas.');
      }
      this.teslaMp3TestStatus = `Čekám na testovací MP3: ${word}`;
      this.render();
      await this.delay(2000);
      response = await this.apiGet<SpellingAudioWordResponse>(path);
    }

    this.teslaMp3TestAudioUrls.set(cacheKey, response.audioUrl);
    return response.audioUrl;
  }

  private teslaMp3TestWordForLanguage(language: LearningLanguage): string {
    return ({
      en: 'tractor',
      de: 'Traktor',
      es: 'tractor',
    } as Record<LearningLanguage, string>)[language];
  }

  private updateTeslaMp3PlayerState(state: TeslaMp3PlayerState): void {
    if (this.teslaMp3PlayerState === state) return;
    this.teslaMp3PlayerState = state;
    this.render();
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

  private async playBlobAudio(audioUrl: string): Promise<void> {
    this.stopBackendAudio();
    const audio = new Audio(audioUrl);
    audio.preload = 'auto';
    this.backendAudio = audio;
    await this.playAudioElement(audio);
    if (this.backendAudio === audio) {
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

  private async speakText(
    text: string,
    rate: number,
    errorMessage: string,
    failureMessage: string,
    language: LearningLanguage = this.selectedLanguage,
  ): Promise<void> {
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
      utterance.lang = this.ttsLanguage(language);
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

  playCelebrationTap(): void {
    if (this.celebrationTapCount >= this.settings.celebrationTapLimit) return;
    this.celebrationTapCount += 1;
    const isFinalTap = this.celebrationTapCount >= this.settings.celebrationTapLimit;
    this.clearCelebrationTapTimer();
    this.celebrationTap = null;
    this.render();
    window.setTimeout(() => {
      this.celebrationTap = isFinalTap ? this.nextCelebrationEscapeTap() : this.nextCelebrationTap();
      this.celebrationPosition = {
        offsetX: this.celebrationTap.offsetX,
        offsetY: this.celebrationTap.offsetY,
      };
      this.playCelebrationFanfare();
      this.celebrationTapTimerId = window.setTimeout(() => {
        this.celebrationTap = null;
        this.celebrationTapTimerId = null;
        this.render();
      }, 720);
      this.render();
    }, 0);
  }

  celebrationTapClasses(): string[] {
    const tap = this.celebrationTap;
    if (!tap) return [this.surprise.animationClass];
    return [
      this.surprise.animationClass,
      'celebration-tap',
      `celebration-${tap.effect}`,
      `celebration-${tap.direction}`,
      `celebration-burst-${tap.burst}`,
      ...(tap.escaping ? ['celebration-escape'] : []),
    ];
  }

  private nextCelebrationTap(): CelebrationTapState {
    const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const animalWidth = Math.min(window.innerHeight * 0.42, 20 * rootFontSize);
    const maxOffsetX = Math.max(4, ((window.innerWidth - animalWidth) / 2 - 12) / rootFontSize);
    const maxOffsetY = Math.max(5, Math.min(20, (window.innerHeight * 0.34) / rootFontSize));
    const nextOffsetX = this.nextCelebrationAxisOffset(this.celebrationPosition.offsetX, -maxOffsetX, maxOffsetX);
    const nextOffsetY = this.nextCelebrationAxisOffset(this.celebrationPosition.offsetY, -maxOffsetY, -1.2);
    return {
      effect: randomItem<CelebrationEffect>(['pop', 'spin', 'squash', 'bounce'], 'pop'),
      direction: randomItem<CelebrationDirection>(['left', 'right'], 'right'),
      burst: randomItem<CelebrationBurst>(['wide', 'high', 'low'], 'wide'),
      offsetX: nextOffsetX,
      offsetY: nextOffsetY,
    };
  }

  private nextCelebrationAxisOffset(current: number, min: number, max: number): number {
    const range = max - min;
    const edgePadding = Math.max(0.8, range * 0.08);
    const candidates = [
      randomNumber(min, max),
      randomNumber(min, max),
      randomNumber(min, min + edgePadding),
      randomNumber(max - edgePadding, max),
    ];
    const farCandidates = candidates.filter((candidate) => Math.abs(candidate - current) >= range * 0.34);
    return randomItem(farCandidates.length ? farCandidates : candidates, current);
  }

  private nextCelebrationEscapeTap(): CelebrationTapState {
    const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const escapeX = (window.innerWidth / rootFontSize) * randomItem([-0.7, 0.7], 0.7);
    const escapeY = -(window.innerHeight / rootFontSize) * randomNumber(0.52, 0.82);
    const direction: CelebrationDirection = escapeX < 0 ? 'left' : 'right';
    return {
      effect: randomItem<CelebrationEffect>(['spin', 'bounce', 'pop'], 'spin'),
      direction,
      burst: randomItem<CelebrationBurst>(['wide', 'high'], 'wide'),
      offsetX: escapeX,
      offsetY: escapeY,
      escaping: true,
    };
  }

  private trophyToSurprise(trophy: TrophyItem): AnimalSurprise {
    return {
      animalKey: trophy.animalKey,
      imagePath: trophy.imagePath,
      animationClass: this.animationClassForAnimalKey(trophy.animalKey),
    };
  }

  private nextFallbackSurprise(): AnimalSurprise {
    const wonKeys = new Set(this.trophies.map((trophy) => trophy.animalKey));
    const available = surprises.filter((surprise) => !wonKeys.has(surprise.animalKey));
    return randomItem(available.length > 0 ? available : surprises, surprises[0]);
  }

  private animationClassForAnimalKey(animalKey: string): string {
    const animationClasses = ['pop', 'floaty', 'wiggle', 'spinny', 'bounce'];
    let hash = 0;
    for (let index = 0; index < animalKey.length; index += 1) {
      hash = (hash * 31 + animalKey.charCodeAt(index)) >>> 0;
    }
    return animationClasses[hash % animationClasses.length] ?? animationClasses[0];
  }

  private playCelebrationFanfare(): void {
    try {
      const AudioContextConstructor = window.AudioContext
        ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) return;
      const context = new AudioContextConstructor();
      const masterGain = context.createGain();
      const variant = this.nextCelebrationFanfareIndex();
      const now = context.currentTime;
      masterGain.gain.setValueAtTime(0.0001, now);
      masterGain.gain.exponentialRampToValueAtTime(0.12, now + 0.03);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.74);
      masterGain.connect(context.destination);
      if (variant === 0) {
        [523.25, 659.25, 783.99].forEach((frequency, index) => {
          this.scheduleCelebrationTone(context, masterGain, frequency, index * 0.11, 0.25);
        });
      } else if (variant === 1) {
        [659.25, 783.99, 659.25, 880, 987.77].forEach((frequency, index) => {
          this.scheduleCelebrationTone(context, masterGain, frequency, index * 0.07, 0.14, 'sine', 0.58);
        });
      } else if (variant === 2) {
        [392, 523.25, 659.25].forEach((frequency, index) => {
          this.scheduleCelebrationTone(context, masterGain, frequency, index * 0.045, 0.18, 'triangle', 0.56);
        });
        [523.25, 659.25, 783.99].forEach((frequency, index) => {
          this.scheduleCelebrationTone(context, masterGain, frequency, 0.25 + index * 0.045, 0.28, 'triangle', 0.72);
        });
      } else {
        this.scheduleCelebrationTone(context, masterGain, 392, 0, 0.42, 'sawtooth', 0.34, 783.99);
        this.scheduleCelebrationTone(context, masterGain, 987.77, 0.24, 0.22, 'triangle', 0.58);
      }
      if (context.state === 'suspended') {
        void context.resume();
      }
      window.setTimeout(() => {
        void context.close().catch(() => undefined);
      }, 900);
    } catch {
      // Celebration tap animation should still run if Web Audio is unavailable.
    }
  }

  private nextCelebrationFanfareIndex(): number {
    const variantCount = 4;
    if (variantCount <= 1) return 0;
    let next = Math.floor(Math.random() * variantCount);
    if (next === this.lastCelebrationFanfareIndex) {
      next = (next + 1 + Math.floor(Math.random() * (variantCount - 1))) % variantCount;
    }
    this.lastCelebrationFanfareIndex = next;
    return next;
  }

  private scheduleCelebrationTone(
    context: AudioContext,
    masterGain: GainNode,
    frequency: number,
    startOffset: number,
    duration: number,
    type: OscillatorType = 'triangle',
    peakGain = 0.8,
    endFrequency: number | null = null,
  ): void {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + startOffset;
    const stop = start + duration;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (endFrequency !== null) {
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, stop);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, stop);
    oscillator.connect(gain);
    gain.connect(masterGain);
    oscillator.start(start);
    oscillator.stop(stop + 0.02);
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

  private async apiPatch<T>(path: string, body: unknown, redirectOnUnauthorized = true): Promise<T> {
    const response = await fetch(`/api/${path}`, {
      method: 'PATCH',
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

  private clearCelebrationTapTimer(): void {
    if (this.celebrationTapTimerId !== null) {
      window.clearTimeout(this.celebrationTapTimerId);
      this.celebrationTapTimerId = null;
    }
  }

  private clearSpellingAnswerWordTimer(): void {
    if (this.spellingAnswerWordTimerId !== null) {
      window.clearTimeout(this.spellingAnswerWordTimerId);
      this.spellingAnswerWordTimerId = null;
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

interface TeslaStreamAudioLoop {
  context: AudioContext;
  destination: MediaStreamAudioDestinationNode;
  oscillator: OscillatorNode;
  keepaliveGain: GainNode;
  wordSource: AudioBufferSourceNode | null;
  wordGain: GainNode | null;
  wordDone: (() => void) | null;
}

interface TeslaWebAudioLoop {
  context: AudioContext;
  oscillator: OscillatorNode;
  keepaliveGain: GainNode;
  wordSource: AudioBufferSourceNode | null;
  wordGain: GainNode | null;
  wordDone: (() => void) | null;
}

class TeslaMp3AudioController {
  private readonly audio = new Audio();
  private foregroundAudio: HTMLAudioElement | null = null;
  private webAudioLoop: TeslaWebAudioLoop | null = null;
  private streamAudioLoop: TeslaStreamAudioLoop | null = null;
  private playbackToken = 0;
  private primed = false;
  private primePromise: Promise<void> | null = null;
  private destroyed = false;

  constructor(
    private readonly onStateChange: (state: TeslaMp3PlayerState) => void,
    private loopMode: TeslaMp3LoopMode,
  ) {
    this.audio.preload = 'auto';
    this.setState('idle');
  }

  setLoopMode(loopMode: TeslaMp3LoopMode): void {
    this.loopMode = teslaMp3LoopOption(loopMode).mode;
    if (this.destroyed || !this.primed) return;
    void this.resumeSilentLoop(false);
  }

  async startLoop(): Promise<void> {
    if (this.destroyed) return;
    if (!this.primed) {
      await this.prime();
      return;
    }
    await this.resumeSilentLoop(false);
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

    const loop = this.currentLoopOption();
    if (loop.webAudioStream) {
      await this.playWithStreamAudio(audioUrl, token);
      return;
    }

    if (loop.webAudio) {
      await this.playWithWebAudio(audioUrl, token);
      return;
    }

    if (loop.backgroundMusic) {
      await this.playWithBackgroundFade(audioUrl, token);
      return;
    }

    this.stopStreamAudioLoop();
    this.stopWebAudioLoop();
    this.audio.pause();
    this.setState('mp3');
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
    this.stopForegroundAudio();
    const loop = this.currentLoopOption();
    if (loop.webAudioStream && this.streamAudioLoop) {
      this.stopStreamWord();
      this.rampStreamKeepalive(loop.webAudioStream.gain, loop.webAudioStream.fadeMs);
      if (!this.destroyed && this.primed) {
        this.setState('loop');
      }
      return;
    }
    if (loop.webAudio && this.webAudioLoop) {
      this.stopWebAudioWord();
      if (!this.destroyed && this.primed) {
        this.setState('loop');
      }
      return;
    }
    this.stopStreamAudioLoop();
    this.stopWebAudioLoop();
    if (this.destroyed || !this.primed) return;
    this.audio.pause();
    void this.resumeSilentLoop(false);
  }

  destroy(): void {
    this.destroyed = true;
    this.nextPlaybackToken();
    this.stopForegroundAudio();
    this.stopStreamAudioLoop();
    this.stopWebAudioLoop();
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.setState('off');
  }

  private async runPrime(): Promise<void> {
    this.setState('priming');
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
    const loop = this.currentLoopOption();
    this.setState('loop');
    if (loop.webAudioStream) {
      await this.startStreamAudioLoop(loop, throwOnFailure);
      return;
    }
    this.stopStreamAudioLoop();
    this.audio.pause();
    if (loop.webAudio) {
      this.audio.removeAttribute('src');
      this.audio.load();
      await this.startWebAudioLoop(loop, throwOnFailure);
      return;
    }
    this.stopWebAudioLoop();
    this.audio.loop = true;
    this.audio.preload = 'auto';
    this.audio.volume = loop.volume;
    if (loop.url && this.audio.src !== loop.url) {
      this.audio.src = loop.url;
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
      this.setState('error');
      if (throwOnFailure) throw error;
    }
  }

  private async startStreamAudioLoop(
    loop: TeslaMp3LoopOption,
    throwOnFailure: boolean,
  ): Promise<TeslaStreamAudioLoop | null> {
    if (!loop.webAudioStream) return null;
    this.stopWebAudioLoop();
    try {
      const streamLoop = this.streamAudioLoop ?? this.createStreamAudioLoop(loop);
      this.streamAudioLoop = streamLoop;
      this.rampStreamKeepalive(loop.webAudioStream.gain, loop.webAudioStream.fadeMs);
      this.audio.loop = false;
      this.audio.volume = loop.volume;
      if (this.audio.srcObject !== streamLoop.destination.stream) {
        this.audio.pause();
        this.audio.removeAttribute('src');
        this.audio.srcObject = streamLoop.destination.stream;
      }
      if (streamLoop.context.state === 'suspended') {
        await streamLoop.context.resume();
      }
      await this.audio.play();
      return streamLoop;
    } catch (error) {
      this.setState('error');
      if (throwOnFailure) throw error;
      return null;
    }
  }

  private createStreamAudioLoop(loop: TeslaMp3LoopOption): TeslaStreamAudioLoop {
    if (!loop.webAudioStream) throw new Error('WebAudio stream loop is not configured.');
    const AudioContextConstructor = this.audioContextConstructor();
    const context = new AudioContextConstructor();
    const destination = context.createMediaStreamDestination();
    const oscillator = context.createOscillator();
    const keepaliveGain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = loop.webAudioStream.frequency;
    keepaliveGain.gain.value = loop.webAudioStream.gain;
    oscillator.connect(keepaliveGain);
    keepaliveGain.connect(destination);
    oscillator.start();
    return {
      context,
      destination,
      oscillator,
      keepaliveGain,
      wordSource: null,
      wordGain: null,
      wordDone: null,
    };
  }

  private async startWebAudioLoop(loop: TeslaMp3LoopOption, throwOnFailure: boolean): Promise<void> {
    if (!loop.webAudio) return;
    try {
      const webLoop = this.webAudioLoop ?? this.createWebAudioLoop(loop);
      this.webAudioLoop = webLoop;
      webLoop.oscillator.frequency.setValueAtTime(loop.webAudio.frequency, webLoop.context.currentTime);
      webLoop.keepaliveGain.gain.setValueAtTime(loop.webAudio.gain, webLoop.context.currentTime);
      if (webLoop.context.state === 'suspended') {
        await webLoop.context.resume();
      }
    } catch (error) {
      this.setState('error');
      if (throwOnFailure) throw error;
    }
  }

  private createWebAudioLoop(loop: TeslaMp3LoopOption): TeslaWebAudioLoop {
    if (!loop.webAudio) throw new Error('WebAudio loop is not configured.');
    const AudioContextConstructor = this.audioContextConstructor();
    const context = new AudioContextConstructor();
    const oscillator = context.createOscillator();
    const keepaliveGain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = loop.webAudio.frequency;
    keepaliveGain.gain.value = loop.webAudio.gain;
    oscillator.connect(keepaliveGain);
    keepaliveGain.connect(context.destination);
    oscillator.start();
    return {
      context,
      oscillator,
      keepaliveGain,
      wordSource: null,
      wordGain: null,
      wordDone: null,
    };
  }

  private async waitForAudioReady(): Promise<void> {
    await this.waitForAudioElementReady(this.audio);
  }

  private async waitForAudioElementReady(audio: HTMLAudioElement): Promise<void> {
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

  private async playUntilDone(timeoutMs: number): Promise<void> {
    await this.playAudioUntilDone(this.audio, timeoutMs);
  }

  private async playAudioUntilDone(audio: HTMLAudioElement, timeoutMs: number): Promise<void> {
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

  private async playWithWebAudio(audioUrl: string, token: number): Promise<void> {
    const loop = this.currentLoopOption();
    await this.startWebAudioLoop(loop, false);
    const webLoop = this.webAudioLoop;
    if (!loop.webAudio || !webLoop || this.destroyed || this.playbackToken !== token) return;

    let source: AudioBufferSourceNode | null = null;
    let wordGain: GainNode | null = null;
    try {
      const buffer = await this.fetchAudioBuffer(webLoop.context, audioUrl);
      if (this.destroyed || this.playbackToken !== token) return;

      this.stopWebAudioWord();
      source = webLoop.context.createBufferSource();
      wordGain = webLoop.context.createGain();
      source.buffer = buffer;
      wordGain.gain.value = 1;
      source.connect(wordGain);
      wordGain.connect(webLoop.context.destination);
      webLoop.wordSource = source;
      webLoop.wordGain = wordGain;

      this.setState('mp3');
      const timeoutMs = Math.max(10000, buffer.duration * 1000 + 1200);
      await this.playWebAudioSourceUntilDone(webLoop, source, timeoutMs);
    } finally {
      if (webLoop.wordSource === source) {
        webLoop.wordSource = null;
        webLoop.wordGain = null;
      }
      try {
        source?.disconnect();
      } catch {
        // Some browsers disconnect ended sources automatically.
      }
      try {
        wordGain?.disconnect();
      } catch {
        // Some browsers disconnect ended nodes automatically.
      }
      if (!this.destroyed && this.playbackToken === token) {
        this.setState('loop');
      }
    }
  }

  private async playWebAudioSourceUntilDone(
    webLoop: TeslaWebAudioLoop,
    source: AudioBufferSourceNode,
    timeoutMs: number,
  ): Promise<void> {
    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(() => done(), timeoutMs);
      const done = () => {
        window.clearTimeout(timeout);
        source.onended = null;
        if (webLoop.wordDone === done) {
          webLoop.wordDone = null;
        }
        resolve();
      };
      webLoop.wordDone = done;
      source.onended = done;
      try {
        source.start();
      } catch {
        done();
      }
    });
  }

  private async playWithStreamAudio(audioUrl: string, token: number): Promise<void> {
    const loop = this.currentLoopOption();
    const streamLoop = await this.startStreamAudioLoop(loop, false);
    if (!loop.webAudioStream || !streamLoop || this.destroyed || this.playbackToken !== token) return;

    let source: AudioBufferSourceNode | null = null;
    let wordGain: GainNode | null = null;
    try {
      const buffer = await this.fetchAudioBuffer(streamLoop.context, audioUrl);
      if (this.destroyed || this.playbackToken !== token) return;

      this.stopStreamWord();
      source = streamLoop.context.createBufferSource();
      wordGain = streamLoop.context.createGain();
      source.buffer = buffer;
      wordGain.gain.value = 1;
      source.connect(wordGain);
      wordGain.connect(streamLoop.destination);
      streamLoop.wordSource = source;
      streamLoop.wordGain = wordGain;

      this.rampStreamKeepalive(loop.webAudioStream.duckedGain, loop.webAudioStream.fadeMs);
      this.setState('mp3');
      const timeoutMs = Math.max(10000, buffer.duration * 1000 + 1200);
      await this.playStreamSourceUntilDone(streamLoop, source, timeoutMs);
    } finally {
      if (streamLoop.wordSource === source) {
        streamLoop.wordSource = null;
        streamLoop.wordGain = null;
      }
      try {
        source?.disconnect();
      } catch {
        // Some browsers disconnect ended sources automatically.
      }
      try {
        wordGain?.disconnect();
      } catch {
        // Some browsers disconnect ended nodes automatically.
      }
      if (!this.destroyed && this.playbackToken === token) {
        await this.resumeSilentLoop(false);
      }
    }
  }

  private async fetchAudioBuffer(context: AudioContext, audioUrl: string): Promise<AudioBuffer> {
    const response = await fetch(audioUrl, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`Audio fetch failed: ${response.status}`);
    const data = await response.arrayBuffer();
    return context.decodeAudioData(data);
  }

  private async playStreamSourceUntilDone(
    streamLoop: TeslaStreamAudioLoop,
    source: AudioBufferSourceNode,
    timeoutMs: number,
  ): Promise<void> {
    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(() => done(), timeoutMs);
      const done = () => {
        window.clearTimeout(timeout);
        source.onended = null;
        if (streamLoop.wordDone === done) {
          streamLoop.wordDone = null;
        }
        resolve();
      };
      streamLoop.wordDone = done;
      source.onended = done;
      try {
        source.start();
      } catch {
        done();
      }
    });
  }

  private async playWithBackgroundFade(audioUrl: string, token: number): Promise<void> {
    const mp3Audio = new Audio(audioUrl);
    this.stopForegroundAudio();
    this.foregroundAudio = mp3Audio;
    mp3Audio.preload = 'auto';
    mp3Audio.load();
    await this.waitForAudioElementReady(mp3Audio);
    if (this.destroyed || this.playbackToken !== token || this.foregroundAudio !== mp3Audio) return;
    await this.fadeLoopVolume(0.035, 240);
    this.setState('mp3');
    await this.playAudioUntilDone(mp3Audio, 10000);
    if (this.foregroundAudio === mp3Audio) {
      this.foregroundAudio = null;
    }
    mp3Audio.removeAttribute('src');
    mp3Audio.load();
    if (!this.destroyed && this.playbackToken === token) {
      await this.fadeLoopVolume(this.currentLoopOption().volume, 420);
      this.setState('loop');
    }
  }

  private stopForegroundAudio(): void {
    if (!this.foregroundAudio) return;
    const audio = this.foregroundAudio;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    this.foregroundAudio = null;
  }

  private stopStreamWord(): void {
    const loop = this.streamAudioLoop;
    if (!loop?.wordSource) return;
    const source = loop.wordSource;
    const gain = loop.wordGain;
    const done = loop.wordDone;
    loop.wordSource = null;
    loop.wordGain = null;
    loop.wordDone = null;
    try {
      source.stop();
    } catch {
      // The source may already be stopped or not started yet.
    }
    done?.();
    try {
      source.disconnect();
    } catch {
      // Some browsers disconnect stopped sources automatically.
    }
    try {
      gain?.disconnect();
    } catch {
      // Some browsers disconnect stopped nodes automatically.
    }
  }

  private stopStreamAudioLoop(): void {
    if (!this.streamAudioLoop) return;
    const loop = this.streamAudioLoop;
    this.stopStreamWord();
    try {
      loop.oscillator.stop();
    } catch {
      // The oscillator may already be stopped if the browser tears down the context.
    }
    try {
      loop.oscillator.disconnect();
      loop.keepaliveGain.disconnect();
      loop.destination.disconnect();
    } catch {
      // Some browsers disconnect closed graphs automatically.
    }
    void loop.context.close().catch(() => undefined);
    if (this.audio.srcObject === loop.destination.stream) {
      this.audio.srcObject = null;
    }
    this.streamAudioLoop = null;
  }

  private stopWebAudioWord(): void {
    const loop = this.webAudioLoop;
    if (!loop?.wordSource) return;
    const source = loop.wordSource;
    const gain = loop.wordGain;
    const done = loop.wordDone;
    loop.wordSource = null;
    loop.wordGain = null;
    loop.wordDone = null;
    try {
      source.stop();
    } catch {
      // The source may already be stopped or not started yet.
    }
    done?.();
    try {
      source.disconnect();
    } catch {
      // Some browsers disconnect stopped sources automatically.
    }
    try {
      gain?.disconnect();
    } catch {
      // Some browsers disconnect stopped nodes automatically.
    }
  }

  private stopWebAudioLoop(): void {
    if (!this.webAudioLoop) return;
    const loop = this.webAudioLoop;
    this.stopWebAudioWord();
    try {
      loop.oscillator.stop();
    } catch {
      // The oscillator may already be stopped if the browser tears down the context.
    }
    try {
      loop.oscillator.disconnect();
      loop.keepaliveGain.disconnect();
    } catch {
      // Some browsers disconnect closed graphs automatically.
    }
    void loop.context.close().catch(() => undefined);
    this.webAudioLoop = null;
  }

  private rampStreamKeepalive(target: number, durationMs: number): void {
    const loop = this.streamAudioLoop;
    if (!loop) return;
    this.rampAudioParam(loop.keepaliveGain.gain, target, durationMs, loop.context);
  }

  private rampAudioParam(param: AudioParam, target: number, durationMs: number, context: AudioContext): void {
    const now = context.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(target, now + durationMs / 1000);
  }

  private async fadeLoopVolume(target: number, durationMs: number): Promise<void> {
    const start = this.audio.volume;
    const startedAt = performance.now();
    while (!this.destroyed) {
      const elapsed = performance.now() - startedAt;
      const progress = Math.min(1, elapsed / durationMs);
      this.audio.volume = start + (target - start) * progress;
      if (progress >= 1) return;
      await this.delay(30);
    }
  }

  private async delay(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
  }

  private setState(state: TeslaMp3PlayerState): void {
    this.onStateChange(state);
  }

  private currentLoopOption(): TeslaMp3LoopOption {
    return teslaMp3LoopOption(this.loopMode);
  }

  private audioContextConstructor(): typeof AudioContext {
    const AudioContextConstructor = window.AudioContext
      ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) throw new Error('Web Audio API is unavailable.');
    return AudioContextConstructor;
  }
}

function randomItem<T>(items: readonly T[], fallback: T): T {
  return items[Math.floor(Math.random() * items.length)] ?? fallback;
}

function randomNumber(min: number, max: number): number {
  return min + Math.random() * (max - min);
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
  return createMonoPcmWavDataUrl(durationMs, () => 0);
}

function createNearSilentWavDataUrl(durationMs: number): string {
  return createMonoPcmWavDataUrl(durationMs, (index) => (index % 2 === 0 ? 1 : -1));
}

function createNoiseWavDataUrl(durationMs: number, amplitude: number): string {
  return createMonoPcmWavDataUrl(durationMs, (index) => {
    const value = Math.sin(index * 12.9898) * 43758.5453;
    return (value - Math.floor(value) - 0.5) * 2 * amplitude;
  });
}

function createLoopableNoiseWavDataUrl(durationMs: number, amplitude: number): string {
  const frequencies = [137, 211, 307, 431, 563];
  const phases = [0.2, 1.7, 2.9, 4.1, 5.4];
  return createMonoPcmWavDataUrl(durationMs, (index, sampleRate) => {
    const seconds = index / sampleRate;
    const sum = frequencies.reduce((total, frequency, frequencyIndex) => {
      const phase = phases[frequencyIndex] ?? 0;
      return total + Math.sin(seconds * Math.PI * 2 * frequency + phase);
    }, 0);
    return (sum / frequencies.length) * amplitude;
  });
}

function createToneWavDataUrl(durationMs: number, frequency: number, amplitude: number): string {
  return createMonoPcmWavDataUrl(durationMs, (index, sampleRate) => {
    return Math.sin((index / sampleRate) * Math.PI * 2 * frequency) * amplitude;
  });
}

function createAmbientMusicWavDataUrl(durationMs: number): string {
  const notes = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63, 293.66, 392.0];
  return createMonoPcmWavDataUrl(durationMs, (index, sampleRate) => {
    const seconds = index / sampleRate;
    const noteIndex = Math.floor(seconds * 2) % notes.length;
    const note = notes[noteIndex] ?? notes[0];
    const phase = seconds * Math.PI * 2;
    const envelope = 0.55 + 0.45 * Math.sin((seconds % 0.5) * Math.PI * 2);
    const root = Math.sin(phase * note) * 900;
    const fifth = Math.sin(phase * note * 1.5) * 360;
    const shimmer = Math.sin(phase * note * 2) * 160;
    return (root + fifth + shimmer) * envelope;
  }, 16000);
}

function createMonoPcmWavDataUrl(
  durationMs: number,
  sampleValue: (index: number, sampleRate: number) => number,
  sampleRate = 8000,
): string {
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
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.max(-32768, Math.min(32767, Math.trunc(sampleValue(index, sampleRate))));
    view.setInt16(44 + index * bytesPerSample, sample, true);
  }
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

function readLocalLoopMode(): TeslaMp3LoopMode {
  return teslaMp3LoopOption(readLocalString(TESLA_MP3_LOOP_MODE_STORAGE_KEY, DEFAULT_TESLA_MP3_LOOP_MODE)).mode;
}

function readLocalString(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) ?? fallback;
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

function writeLocalString(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Some embedded browsers may block storage; keep the in-memory setting active.
  }
}

function teslaMp3LoopOption(mode: string): TeslaMp3LoopOption {
  return TESLA_MP3_LOOP_OPTIONS.find((option) => option.mode === mode)
    ?? TESLA_MP3_LOOP_OPTIONS.find((option) => option.mode === DEFAULT_TESLA_MP3_LOOP_MODE)
    ?? TESLA_MP3_LOOP_OPTIONS[0];
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
  if (language === 'cs') return 'cs-CZ';
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
  if (language === 'cs') {
    return ({
      a: 'á',
      b: 'bé',
      c: 'cé',
      d: 'dé',
      e: 'é',
      f: 'ef',
      g: 'gé',
      h: 'há',
      i: 'í',
      j: 'jé',
      k: 'ká',
      l: 'el',
      m: 'em',
      n: 'en',
      o: 'ó',
      p: 'pé',
      q: 'kvé',
      r: 'er',
      s: 'es',
      t: 'té',
      u: 'ú',
      v: 'vé',
      w: 'dvojité vé',
      x: 'iks',
      y: 'ypsilon',
      z: 'zet',
      á: 'dlouhé á',
      č: 'čé',
      ď: 'ďé',
      é: 'dlouhé é',
      ě: 'ě',
      í: 'dlouhé í',
      ň: 'eň',
      ó: 'dlouhé ó',
      ř: 'eř',
      š: 'eš',
      ť: 'ťé',
      ú: 'dlouhé ú',
      ů: 'ů',
      ý: 'dlouhé ypsilon',
      ž: 'žet',
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

function statsWeight(stats: QuestionStats | undefined): number {
  return Math.max(1, 1 + (stats?.wrong ?? 0) - (stats?.correct ?? 0));
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

function normalizeTestMenuNode(node: TestMenuNode): TestMenuNode {
  return {
    key: node.key,
    label: node.label,
    children: (node.children ?? []).map((child) => normalizeTestMenuNode(child)),
    launchable: Boolean(node.launchable),
    visible: node.visible !== false,
  };
}

function sameStringList(first: string[], second: string[]): boolean {
  if (first.length !== second.length) return false;
  return first.every((value, index) => value === second[index]);
}

const surprises: AnimalSurprise[] = Array.from({ length: 40 }, (_, index) => ({
  animalKey: `animal-${String(index + 1).padStart(2, '0')}`,
  imagePath: `/assets/animals/animal-${String(index + 1).padStart(2, '0')}.svg`,
  animationClass: ['pop', 'floaty', 'wiggle', 'spinny', 'bounce'][index % 5],
}));
