import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameSettings, LearningLanguage, languageLabels } from '../../domain/models';
import { ApiClient } from '../../infrastructure/api-client.service';
import { BootstrapDataService } from '../../infrastructure/bootstrap-data.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="screen subpage-screen">
      <div class="subpage-heading">
        <h1>Nastavení</h1>
      </div>

      <p class="status" *ngIf="loading">Načítám...</p>
      <p class="error" *ngIf="error">{{ error }}</p>
      <p class="success" *ngIf="saved">Uloženo.</p>

      <form class="settings-layout subpage-card" *ngIf="settings" (ngSubmit)="saveSettings()">
        <label>Čas na otázku
          <input class="text-input" type="number" min="1" name="secondsLimit" [(ngModel)]="settings.secondsLimit">
        </label>
        <label>Cílové skóre
          <input class="text-input" type="number" min="1" name="targetScore" [(ngModel)]="settings.targetScore">
        </label>
        <label>Max tapnutí na gratulaci
          <input class="text-input" type="number" min="0" name="celebrationTapLimit" [(ngModel)]="settings.celebrationTapLimit">
        </label>
        <label>Audio
          <select class="text-input" name="audioSource" [(ngModel)]="settings.audioSource">
            <option value="browser_tts">Browser TTS</option>
            <option value="backend_mp3">Serverové MP3</option>
          </select>
        </label>
        <label>Flipcards
          <select class="text-input" name="flipcardSource" [(ngModel)]="settings.flipcardSource">
            <option value="all_words">Všechna slovíčka</option>
            <option value="ready_only">Jen připravené assety</option>
          </select>
        </label>
        <button class="primary-button" type="submit">Uložit nastavení</button>
      </form>

      <section class="content-editor subpage-card">
        <div class="segmented">
          <button type="button" *ngFor="let language of languages" [class.active]="language === selectedLanguage" (click)="selectLanguage(language)">
            {{ languageLabels[language] }}
          </button>
        </div>
        <label>Spelling sady
          <textarea class="text-area" [(ngModel)]="spellingText" name="spellingText"></textarea>
        </label>
        <label>Flipcard slovíčka
          <textarea class="text-area" [(ngModel)]="flipcardText" name="flipcardText"></textarea>
        </label>
        <button class="primary-button" type="button" (click)="saveContent()">Uložit obsah</button>
      </section>
    </section>
  `,
})
export class SettingsComponent implements OnInit {
  readonly languages: LearningLanguage[] = ['en', 'de', 'es'];
  readonly languageLabels = languageLabels;
  selectedLanguage: LearningLanguage = 'en';
  settings: GameSettings | null = null;
  spellingText = '';
  flipcardText = '';
  loading = true;
  saved = false;
  error: string | null = null;

  constructor(
    private readonly api: ApiClient,
    private readonly bootstrap: BootstrapDataService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const boot = this.bootstrap.read();
      if (boot.settings) {
        this.selectedLanguage = boot.language ?? this.selectedLanguage;
        this.settings = boot.settings;
        this.spellingText = (boot.spellingSets ?? []).map((set) => set.rawWords).join('\n');
        this.flipcardText = boot.flipcardWords?.words ?? '';
      } else {
        this.settings = await this.api.settings();
        await this.loadContent();
      }
    } catch {
      this.error = 'Nastavení se nepodařilo načíst.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async selectLanguage(language: LearningLanguage): Promise<void> {
    this.selectedLanguage = language;
    await this.loadContent();
    this.cdr.detectChanges();
  }

  async saveSettings(): Promise<void> {
    if (!this.settings) return;
    this.settings = await this.api.saveSettings(this.settings);
    this.markSaved();
    this.cdr.detectChanges();
  }

  async saveContent(): Promise<void> {
    const sets = this.spellingText.split('\n').map((line) => line.trim()).filter(Boolean);
    await this.api.saveSpellingSets(this.selectedLanguage, sets, Math.max(0, sets.length - 1));
    await this.api.saveFlipcardWords(this.selectedLanguage, this.flipcardText);
    this.markSaved();
    this.cdr.detectChanges();
  }

  private async loadContent(): Promise<void> {
    const [sets, flipcards] = await Promise.all([
      this.api.spellingSets(this.selectedLanguage),
      this.api.flipcardWords(this.selectedLanguage),
    ]);
    this.spellingText = sets.map((set) => set.rawWords).join('\n');
    this.flipcardText = flipcards.words;
  }

  private markSaved(): void {
    this.saved = true;
    window.setTimeout(() => {
      this.saved = false;
    }, 1600);
  }
}
