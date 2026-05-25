import { Injectable } from '@angular/core';
import {
  ActivityCatalog,
  FlipcardAssetsResponse,
  FlipcardWordsResponse,
  GameSettings,
  LearningLanguage,
  PracticeDeck,
  SpellingSet,
  TranslationBackfillStatus,
  TrophyItem,
} from '../domain/models';

export interface BootstrapData {
  catalog?: ActivityCatalog;
  settings?: GameSettings;
  spellingSets?: SpellingSet[];
  flipcardWords?: FlipcardWordsResponse;
  assets?: FlipcardAssetsResponse;
  translation?: TranslationBackfillStatus;
  language?: LearningLanguage;
  deck?: PracticeDeck;
  practiceError?: string;
  trophies?: TrophyItem[];
}

declare global {
  interface Window {
    __KIDS_BOOTSTRAP__?: BootstrapData;
  }
}

@Injectable({ providedIn: 'root' })
export class BootstrapDataService {
  read(): BootstrapData {
    const data = window.__KIDS_BOOTSTRAP__ ?? {};
    window.__KIDS_BOOTSTRAP__ = {};
    return data;
  }
}
