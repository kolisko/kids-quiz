import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, Observable } from 'rxjs';
import {
  ActivityCatalog,
  AudioStatusResponse,
  BulkAssetResponse,
  FlipcardAssetsResponse,
  FlipcardWordsResponse,
  GameSettings,
  ImageStatusResponse,
  LearningLanguage,
  PracticeAnswerKind,
  PracticeAnswerResponse,
  PracticeDeck,
  PracticeDirection,
  SpellingSet,
  TranslationBackfillStatus,
  TrophyItem,
} from '../domain/models';

@Injectable({ providedIn: 'root' })
export class ApiClient {
  constructor(private readonly http: HttpClient) {}

  async session(): Promise<boolean> {
    return (await this.get<{ authenticated: boolean }>('session')).authenticated;
  }

  async login(password: string): Promise<boolean> {
    return (await this.post<{ authenticated: boolean }>('session/login', { password })).authenticated;
  }

  catalog(): Promise<ActivityCatalog> {
    return this.get<ActivityCatalog>('activities');
  }

  settings(): Promise<GameSettings> {
    return this.get<GameSettings>('settings');
  }

  saveSettings(settings: GameSettings): Promise<GameSettings> {
    return this.put<GameSettings>('settings', settings);
  }

  deck(activityId: string, mode: string | null, limit = 10): Promise<PracticeDeck> {
    return this.post<PracticeDeck>('practice/deck', { activityId, mode, limit });
  }

  answer(
    activityId: string,
    itemId: string,
    result: PracticeAnswerKind,
    direction: PracticeDirection = 'product_to_factors',
  ): Promise<PracticeAnswerResponse> {
    return this.post<PracticeAnswerResponse>('practice/answers', { activityId, itemId, result, direction });
  }

  spellingSets(language: LearningLanguage): Promise<SpellingSet[]> {
    return this.get<SpellingSet[]>(`content/spelling/sets?language=${language}`);
  }

  saveSpellingSets(language: LearningLanguage, sets: string[], latestSetIndex: number | null): Promise<SpellingSet[]> {
    return this.put<SpellingSet[]>(`content/spelling/sets?language=${language}`, { sets, latestSetIndex });
  }

  flipcardWords(language: LearningLanguage): Promise<FlipcardWordsResponse> {
    return this.get<FlipcardWordsResponse>(`content/flipcards/words?language=${language}`);
  }

  saveFlipcardWords(language: LearningLanguage, words: string): Promise<FlipcardWordsResponse> {
    return this.put<FlipcardWordsResponse>(`content/flipcards/words?language=${language}`, { words });
  }

  flipcardAssets(language: LearningLanguage): Promise<FlipcardAssetsResponse> {
    return this.get<FlipcardAssetsResponse>(`assets/flipcards?language=${language}`);
  }

  generateMissingImages(language: LearningLanguage): Promise<BulkAssetResponse> {
    return this.post<BulkAssetResponse>(`assets/flipcards/images/missing?language=${language}`, {});
  }

  generateMissingAudio(language: LearningLanguage): Promise<BulkAssetResponse> {
    return this.post<BulkAssetResponse>(`assets/flipcards/audio/missing?language=${language}`, {});
  }

  imageStatus(word: string): Promise<ImageStatusResponse> {
    return this.get<ImageStatusResponse>(`assets/images/${encodeURIComponent(word)}`);
  }

  generateImage(word: string, force = false): Promise<ImageStatusResponse> {
    return this.post<ImageStatusResponse>(`assets/images/${encodeURIComponent(word)}?force=${force}`, {});
  }

  audioStatus(word: string, language: LearningLanguage, kind: 'word' | 'spelling' = 'word'): Promise<AudioStatusResponse> {
    return this.get<AudioStatusResponse>(`assets/audio/${encodeURIComponent(word)}?language=${language}&kind=${kind}`);
  }

  generateAudio(word: string, language: LearningLanguage, force = false): Promise<AudioStatusResponse> {
    return this.post<AudioStatusResponse>(
      `assets/audio/${encodeURIComponent(word)}?language=${language}&kind=word&force=${force}&forFlipcard=true`,
      {},
    );
  }

  translationStatus(language: LearningLanguage): Promise<TranslationBackfillStatus> {
    return this.get<TranslationBackfillStatus>(`assets/translations?language=${language}`);
  }

  backfillTranslations(language: LearningLanguage): Promise<TranslationBackfillStatus> {
    return this.post<TranslationBackfillStatus>(`assets/translations?language=${language}`, {});
  }

  trophies(): Promise<TrophyItem[]> {
    return this.get<TrophyItem[]>('trophies');
  }

  awardTrophy(animalKey: string): Promise<TrophyItem[]> {
    return this.post<TrophyItem[]>('trophies', { animalKey });
  }

  private async get<T>(path: string): Promise<T> {
    return this.request(() => this.http.get<T>(`/api/v2/${path}`, { withCredentials: true }));
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request(() => this.http.post<T>(`/api/v2/${path}`, body, { withCredentials: true }));
  }

  private async put<T>(path: string, body: unknown): Promise<T> {
    return this.request(() => this.http.put<T>(`/api/v2/${path}`, body, { withCredentials: true }));
  }

  private async request<T>(operation: () => Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(operation()) as T;
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        throw new ApiError(error.status, JSON.stringify(error.error ?? error.message));
      }
      throw error;
    }
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
