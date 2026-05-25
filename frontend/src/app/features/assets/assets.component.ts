import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FlipcardAsset, LearningLanguage, languageLabels, TranslationBackfillStatus } from '../../domain/models';
import { ApiClient } from '../../infrastructure/api-client.service';
import { AudioPlayer } from '../../infrastructure/audio-player.service';
import { BootstrapDataService } from '../../infrastructure/bootstrap-data.service';

@Component({
  selector: 'app-assets',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="screen subpage-screen">
      <div class="subpage-heading">
        <h1>Assety</h1>
      </div>

      <div class="toolbar asset-toolbar subpage-card">
        <select class="text-input" [(ngModel)]="language" (ngModelChange)="load()">
          <option *ngFor="let option of languages" [value]="option">{{ languageLabels[option] }}</option>
        </select>
        <button class="ghost-button" type="button" (click)="generateMissingImages()">Doplnit obrázky</button>
        <button class="ghost-button" type="button" (click)="generateMissingAudio()">Doplnit audio</button>
        <button class="ghost-button" type="button" (click)="backfillTranslations()">Přeložit slovíčka</button>
      </div>

      <p class="status" *ngIf="loading">Načítám assety...</p>
      <p class="error" *ngIf="error">{{ error }}</p>
      <p class="success" *ngIf="message">{{ message }}</p>
      <p class="status" *ngIf="translation">Překlady: {{ translation.readyCount }} / {{ translation.totalCount }} ({{ translation.status }})</p>

      <div class="asset-grid">
        <article class="asset-card" *ngFor="let asset of assets">
          <img *ngIf="asset.imageUrl" [src]="asset.imageUrl" alt="">
          <div class="asset-meta">
            <strong>{{ asset.word }}</strong>
            <span>Obrázek: {{ asset.imageStatus }}</span>
            <span>Audio: {{ asset.audioStatus }}</span>
          </div>
          <div class="asset-actions">
            <button class="ghost-button" type="button" (click)="generateImage(asset)">Obrázek</button>
            <button class="ghost-button" type="button" (click)="generateAudio(asset)">Audio</button>
            <button class="ghost-button" type="button" [disabled]="!asset.audioUrl" (click)="play(asset)">Přehrát</button>
          </div>
        </article>
      </div>
    </section>
  `,
})
export class AssetsComponent implements OnInit {
  readonly languages: LearningLanguage[] = ['en', 'de', 'es'];
  readonly languageLabels = languageLabels;
  language: LearningLanguage = 'en';
  assets: FlipcardAsset[] = [];
  translation: TranslationBackfillStatus | null = null;
  loading = true;
  message: string | null = null;
  error: string | null = null;

  constructor(
    private readonly api: ApiClient,
    private readonly audio: AudioPlayer,
    private readonly bootstrap: BootstrapDataService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const boot = this.bootstrap.read();
    if (boot.assets) {
      this.language = boot.language ?? this.language;
      this.assets = boot.assets.items;
      this.translation = boot.translation ?? null;
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }
    void this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const [assets, translation] = await Promise.all([
        this.api.flipcardAssets(this.language),
        this.api.translationStatus(this.language),
      ]);
      this.assets = assets.items;
      this.translation = translation;
    } catch {
      this.error = 'Assety se nepodařilo načíst.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async generateMissingImages(): Promise<void> {
    const response = await this.api.generateMissingImages(this.language);
    this.message = `Obrázky ve frontě: ${response.queued}`;
    await this.load();
    this.cdr.detectChanges();
  }

  async generateMissingAudio(): Promise<void> {
    const response = await this.api.generateMissingAudio(this.language);
    this.message = `Audio ve frontě: ${response.queued}`;
    await this.load();
    this.cdr.detectChanges();
  }

  async backfillTranslations(): Promise<void> {
    this.translation = await this.api.backfillTranslations(this.language);
    this.message = 'Překlady jsou ve frontě.';
    this.cdr.detectChanges();
  }

  async generateImage(asset: FlipcardAsset): Promise<void> {
    await this.api.generateImage(asset.conceptKey, true);
    await this.load();
    this.cdr.detectChanges();
  }

  async generateAudio(asset: FlipcardAsset): Promise<void> {
    await this.api.generateAudio(asset.word, asset.language, true);
    await this.load();
    this.cdr.detectChanges();
  }

  play(asset: FlipcardAsset): void {
    if (asset.audioUrl) void this.audio.playUrl(asset.audioUrl);
  }
}
