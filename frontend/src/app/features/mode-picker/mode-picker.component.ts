import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ArrowLeft, Calculator, Images, Play, SpellCheck } from 'lucide-angular';
import { LucideAngularModule } from 'lucide-angular';
import { ActivitySummary, LearningLanguage, languageLabels } from '../../domain/models';
import { ApiClient } from '../../infrastructure/api-client.service';
import { BootstrapDataService } from '../../infrastructure/bootstrap-data.service';

interface ModeOption {
  label: string;
  value: string | null;
}

type SubjectKey = 'math' | LearningLanguage;

@Component({
  selector: 'app-mode-picker',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <section [class]="modeScreenClass">
      <div class="kid-subpage-bar">
        <button class="kid-back-button" type="button" (click)="router.navigateByUrl('/home')">
          <lucide-icon [img]="backIcon" [size]="24"></lucide-icon>
          <span>Zpět</span>
        </button>
      </div>

      <div class="screen-heading kid-heading">
        <h1>{{ activityHeading }}</h1>
        <p class="kid-subtitle" *ngIf="activityLanguage">{{ activityLanguage }}</p>
      </div>

      <p class="status" *ngIf="loading">Načítám režimy...</p>
      <p class="error" *ngIf="error">{{ error }}</p>

      <div class="mode-grid" *ngIf="activity">
        <button class="mode-card" type="button" *ngFor="let mode of modes" (click)="start(mode.value)">
          <span class="mode-icon" aria-hidden="true">
            <lucide-icon [img]="modeIcon" [size]="34"></lucide-icon>
          </span>
          <span>
            <strong>{{ mode.label }}</strong>
          </span>
          <span class="mode-cta">
            <lucide-icon [img]="playIcon" [size]="22"></lucide-icon>
          </span>
        </button>
      </div>
    </section>
  `,
})
export class ModePickerComponent implements OnInit {
  readonly backIcon = ArrowLeft;
  readonly playIcon = Play;
  readonly mathIcon = Calculator;
  readonly spellingIcon = SpellCheck;
  readonly flipcardsIcon = Images;
  activity: ActivitySummary | null = null;
  loading = true;
  error: string | null = null;
  modes: ModeOption[] = [];

  constructor(
    private readonly route: ActivatedRoute,
    readonly router: Router,
    private readonly api: ApiClient,
    private readonly bootstrap: BootstrapDataService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    const activityId = this.route.snapshot.queryParamMap.get('activityId');
    if (!activityId) {
      await this.router.navigateByUrl('/home');
      return;
    }
    try {
      const catalog = this.bootstrap.read().catalog ?? await this.api.catalog();
      this.activity = catalog.activities.find((candidate) => candidate.id === activityId) ?? null;
      if (!this.activity) throw new Error('missing activity');
      this.modes = this.modesFor(this.activity.kind);
    } catch {
      this.error = 'Režimy se nepodařilo načíst.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  start(mode: string | null): void {
    if (!this.activity) return;
    void this.router.navigate(['/practice'], {
      queryParams: {
        activityId: this.activity.id,
        ...(mode ? { mode } : {}),
      },
    });
  }

  get activityHeading(): string {
    if (!this.activity) return 'Aktivita';
    if (this.activity.kind === 'multiplication') return this.activity.label;
    if (this.activity.kind === 'spelling') return 'Spelling';
    return 'Flipcards';
  }

  get activityLanguage(): string | null {
    if (!this.activity?.language) return null;
    return languageLabels[this.activity.language];
  }

  get modeScreenClass(): string {
    return `screen kid-mode-screen subject-theme-${this.subjectKey}`;
  }

  get modeIcon() {
    if (this.activity?.kind === 'multiplication') return this.mathIcon;
    if (this.activity?.kind === 'spelling') return this.spellingIcon;
    return this.flipcardsIcon;
  }

  private modesFor(kind: ActivitySummary['kind']): ModeOption[] {
    if (kind === 'multiplication') {
      return [
        { label: 'Najdi násobení', value: 'product_to_factors' },
        { label: 'Spočítej výsledek', value: 'factors_to_product' },
        { label: 'Mix', value: 'mix' },
      ];
    }
    if (kind === 'spelling') {
      return [
        { label: 'Nová slovíčka', value: 'latest' },
        { label: 'Starší slovíčka', value: 'older' },
      ];
    }
    return [{ label: 'Obrázkové kartičky', value: null }];
  }

  private get subjectKey(): SubjectKey {
    if (!this.activity || this.activity.kind === 'multiplication') return 'math';
    return this.activity.language ?? 'en';
  }
}
