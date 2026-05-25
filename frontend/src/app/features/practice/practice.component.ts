import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ArrowLeft, Check, Eye, Play, X } from 'lucide-angular';
import { LucideAngularModule } from 'lucide-angular';
import { TimerService } from '../../application/timer.service';
import { PracticeFacade, PracticeItem } from '../../application/practice-facade.service';
import { LearningLanguage, PracticeDeck, PracticeDirection, languageLabels } from '../../domain/models';
import { ApiClient } from '../../infrastructure/api-client.service';
import { AudioPlayer } from '../../infrastructure/audio-player.service';
import { BootstrapDataService } from '../../infrastructure/bootstrap-data.service';

type SubjectKey = 'math' | LearningLanguage;

@Component({
  selector: 'app-practice',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <section [class]="practiceScreenClass" *ngIf="deck && item">
      <header class="practice-top">
        <button class="kid-exit-button" type="button" (click)="leave()">
          <lucide-icon [img]="backIcon" [size]="22"></lucide-icon>
          <span>Konec</span>
        </button>
        <div class="practice-stats" aria-label="Výsledek tréninku">
          <span class="stat-pill"><small>Skóre</small>{{ score }} / {{ deck.settings.targetScore }}</span>
          <span class="stat-pill"><small>Čas</small>{{ secondsLeft }} s</span>
        </div>
      </header>

      <div [class]="practiceCardClass">
        <p class="practice-floating-status" [class.practice-floating-status-visible]="timedOut">Čas vypršel.</p>
        <ng-container *ngIf="isMultiplicationPractice; else wordPractice">
          <div class="math-practice-content">
            <div class="math-prompt">{{ item.prompt }}</div>
            <p class="answer math-answer" [class.math-answer-visible]="answerVisible">
              {{ answerVisible ? item.answer : '' }}
            </p>
          </div>
        </ng-container>
        <ng-template #wordPractice>
          <p class="eyebrow">{{ practiceLabel }}</p>
          <img class="practice-image" *ngIf="item.imageUrl" [src]="item.imageUrl" alt="" (error)="item.imageUrl = null">
          <div class="practice-visual" *ngIf="showPracticeVisual" aria-hidden="true">{{ item.visualLabel }}</div>
          <h1>{{ item.prompt }}</h1>
          <button class="kid-secondary-button" type="button" *ngIf="deck.activity.kind === 'spelling'" (click)="playPrompt()">
            <lucide-icon [img]="playIcon" [size]="22"></lucide-icon>
            <span>Přehrát</span>
          </button>
          <p class="answer practice-answer" [class.practice-answer-visible]="answerVisible">
            {{ answerVisible ? item.answer : '' }}
          </p>
        </ng-template>
      </div>

      <div class="practice-actions" [class.practice-actions-revealed]="answerVisible && !timedOut">
        <button class="kid-action-button primary" type="button" *ngIf="!answerVisible && !timedOut" (click)="showAnswer()">
          <lucide-icon [img]="eyeIcon" [size]="26"></lucide-icon>
          <span>Ukázat odpověď</span>
        </button>
        <button class="kid-action-button danger" type="button" *ngIf="answerVisible && !timedOut" (click)="record('wrong')">
          <lucide-icon [img]="wrongIcon" [size]="28"></lucide-icon>
          <span>Špatně</span>
        </button>
        <button class="kid-action-button success" type="button" *ngIf="answerVisible && !timedOut" (click)="record('correct')">
          <lucide-icon [img]="correctIcon" [size]="28"></lucide-icon>
          <span>Správně</span>
        </button>
        <button class="kid-action-button primary" type="button" *ngIf="timedOut" (click)="nextRound()">Další</button>
      </div>
    </section>

    <section class="screen" *ngIf="loading">
      <p class="status">Připravuji trénink...</p>
    </section>

    <section class="screen" *ngIf="error">
      <p class="error">{{ error }}</p>
      <button class="primary-button" type="button" (click)="router.navigateByUrl('/home')">Zpět na výběr</button>
    </section>
  `,
})
export class PracticeComponent implements OnInit, OnDestroy {
  readonly backIcon = ArrowLeft;
  readonly eyeIcon = Eye;
  readonly playIcon = Play;
  readonly correctIcon = Check;
  readonly wrongIcon = X;
  deck: PracticeDeck | null = null;
  item: PracticeItem | null = null;
  loading = true;
  error: string | null = null;
  score = 0;
  secondsLeft = 0;
  answerVisible = false;
  timedOut = false;
  private activityId = '';
  private mode: string | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    readonly router: Router,
    private readonly practice: PracticeFacade,
    private readonly timer: TimerService,
    private readonly audio: AudioPlayer,
    private readonly api: ApiClient,
    private readonly bootstrap: BootstrapDataService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    this.activityId = this.route.snapshot.queryParamMap.get('activityId') ?? '';
    this.mode = this.route.snapshot.queryParamMap.get('mode');
    if (!this.activityId) {
      await this.router.navigateByUrl('/home');
      return;
    }
    try {
      const boot = this.bootstrap.read();
      if (boot.practiceError) {
        this.error = 'Tahle aktivita zatím nemá připravené položky.';
        this.cdr.detectChanges();
        return;
      }
      this.deck = this.isBootDeckForCurrentRoute(boot.deck) ? boot.deck : await this.practice.load(this.activityId, this.mode);
      this.nextRound();
    } catch {
      this.error = 'Trénink se nepodařilo načíst.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  ngOnDestroy(): void {
    this.timer.stop();
    this.audio.stop();
  }

  showAnswer(): void {
    this.answerVisible = true;
    this.timer.stop();
    this.cdr.detectChanges();
  }

  async record(result: 'correct' | 'wrong'): Promise<void> {
    if (!this.deck || !this.item) return;
    this.score = await this.practice.answer(this.deck, this.item, result, this.score);
    if (this.score >= this.deck.settings.targetScore) {
      await this.finish();
      return;
    }
    this.nextRound();
    this.cdr.detectChanges();
  }

  async nextRound(): Promise<void> {
    if (!this.deck) return;
    this.timer.stop();
    this.answerVisible = false;
    this.timedOut = false;
    this.item = this.practice.pick(this.deck, this.directionForRound());
    if (!this.item) {
      this.error = 'V téhle aktivitě zatím nejsou žádné položky.';
      this.cdr.detectChanges();
      return;
    }
    this.startTimer();
    if (this.deck.activity.kind === 'spelling' || this.deck.activity.kind === 'flipcards') {
      window.setTimeout(() => this.playPrompt(), 150);
    }
    this.cdr.detectChanges();
  }

  async playPrompt(): Promise<void> {
    if (!this.deck || !this.item) return;
    const language = this.deck.activity.language ?? 'en';
    if (this.item.audioUrl) {
      await this.audio.playUrl(this.item.audioUrl).catch(() => this.audio.speak(this.item?.answer ?? '', language as LearningLanguage));
      return;
    }
    if (this.deck.settings.audioSource === 'backend_mp3') {
      const status = await this.api.audioStatus(this.item.answer, language as LearningLanguage).catch(() => null);
      if (status?.audioUrl) {
        await this.audio.playUrl(status.audioUrl).catch(() => this.audio.speak(this.item?.answer ?? '', language as LearningLanguage));
        return;
      }
    }
    this.audio.speak(this.item.answer, language as LearningLanguage);
  }

  leave(): void {
    this.router.navigateByUrl('/home');
  }

  get practiceCardClass(): string {
    return this.isMultiplicationPractice ? 'practice-card math-practice-card' : 'practice-card';
  }

  get practiceScreenClass(): string {
    return `practice-screen subject-theme-${this.subjectKey}`;
  }

  get practiceLabel(): string {
    if (!this.deck) return '';
    const language = this.deck.activity.language ? languageLabels[this.deck.activity.language] : '';
    return `${this.deck.activity.kind === 'spelling' ? 'Spelling' : 'Flipcards'}${language ? ` · ${language}` : ''}`;
  }

  get isMultiplicationPractice(): boolean {
    return this.deck?.activity.kind === 'multiplication';
  }

  get showPracticeVisual(): boolean {
    return !!this.item && !this.item.imageUrl && this.deck?.activity.kind !== 'multiplication';
  }

  private get subjectKey(): SubjectKey {
    if (!this.deck || this.deck.activity.kind === 'multiplication') return 'math';
    return this.deck.activity.language ?? 'en';
  }

  private isBootDeckForCurrentRoute(deck: PracticeDeck | undefined): deck is PracticeDeck {
    if (!deck) return false;
    return deck.activity.id === this.activityId && (deck.mode ?? null) === (this.mode ?? null);
  }

  private startTimer(): void {
    if (!this.deck) return;
    this.timer.start(
      this.deck.settings.secondsLimit,
      (left) => {
        this.secondsLeft = left;
        this.cdr.detectChanges();
      },
      async () => {
        if (!this.deck || !this.item) return;
        this.answerVisible = true;
        this.timedOut = true;
        this.score = await this.practice.answer(this.deck, this.item, 'timeout', this.score);
        this.cdr.detectChanges();
      },
    );
  }

  private directionForRound(): PracticeDirection {
    if (this.mode === 'factors_to_product') return 'factors_to_product';
    if (this.mode === 'mix') return Math.random() > 0.5 ? 'factors_to_product' : 'product_to_factors';
    return 'product_to_factors';
  }

  private async finish(): Promise<void> {
    const animalIndex = Math.floor(Math.random() * 40) + 1;
    const animalKey = `animal-${String(animalIndex).padStart(2, '0')}`;
    await this.api.awardTrophy(animalKey).catch(() => null);
    await this.router.navigate(['/celebration'], { queryParams: { animalKey } });
  }
}
