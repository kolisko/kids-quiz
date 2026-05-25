export type ActivityKind = 'multiplication' | 'spelling' | 'flipcards';
export type LearningLanguage = 'en' | 'de' | 'es';
export type PracticeDirection = 'product_to_factors' | 'factors_to_product';
export type PracticeMode = PracticeDirection | 'mix' | 'latest' | 'older';
export type PracticeAnswerKind = 'correct' | 'wrong' | 'timeout';
export type AudioSource = 'browser_tts' | 'backend_mp3';
export type FlipcardSource = 'all_words' | 'ready_only';
export type ArtifactStatus = 'ready' | 'missing' | 'queued' | 'generating' | 'error';

export interface AuthStatusResponse {
  authenticated: boolean;
}

export interface GameSettings {
  secondsLimit: number;
  targetScore: number;
  celebrationTapLimit: number;
  audioSource: AudioSource;
  flipcardSource: FlipcardSource;
}

export interface ActivitySummary {
  id: string;
  kind: ActivityKind;
  label: string;
  language: LearningLanguage | null;
  testId: number | null;
  questionCount: number;
}

export interface ActivityCatalog {
  activities: ActivitySummary[];
  languages: LearningLanguage[];
}

export interface Question {
  id: number;
  q: string;
  answers: string[];
}

export interface QuestionStats {
  correct: number;
  wrong: number;
  timeout: number;
}

export interface SpellingWord {
  id: number;
  text: string;
  normalized: string;
}

export interface FlipcardWord {
  text: string;
  normalized: string;
  conceptKey: string;
}

export interface PracticeDeck {
  activity: ActivitySummary;
  mode: string | null;
  settings: GameSettings;
  questions: Question[];
  spellingWords: SpellingWord[];
  flipcardWords: FlipcardWord[];
  flipcardAssets: FlipcardAsset[];
  questionStats: Record<string, QuestionStats>;
  wordStats: Record<string, QuestionStats>;
}

export interface PracticeAnswerResponse {
  itemId: string;
  stats: QuestionStats;
}

export interface SpellingSet {
  id: number;
  rawWords: string;
  isLatest: boolean;
  words: SpellingWord[];
  language: LearningLanguage;
}

export interface FlipcardWordsResponse {
  words: string;
  items: FlipcardWord[];
}

export interface FlipcardAsset {
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

export interface FlipcardAssetsResponse {
  items: FlipcardAsset[];
}

export interface BulkAssetResponse {
  total: number;
  queued: number;
  alreadyReady: number;
  alreadyActive: number;
}

export interface TrophyItem {
  animalKey: string;
  imagePath: string;
  wonCount: number;
  firstWonAt: string;
  lastWonAt: string;
}

export interface TranslationBackfillStatus {
  language: LearningLanguage;
  status: ArtifactStatus;
  readyCount: number;
  totalCount: number;
  error?: string | null;
  updatedAt?: string | null;
}

export interface AudioStatusResponse {
  word: string;
  normalized: string;
  status: ArtifactStatus;
  kind: 'word' | 'spelling';
  audioUrl: string | null;
  error?: string | null;
}

export interface ImageStatusResponse {
  word: string;
  normalized: string;
  status: ArtifactStatus;
  imageUrl: string | null;
  error?: string | null;
}

export const languageLabels: Record<LearningLanguage, string> = {
  en: 'Angličtina',
  de: 'Němčina',
  es: 'Španělština',
};
