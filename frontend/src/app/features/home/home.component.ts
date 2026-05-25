import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Calculator, Images, SpellCheck } from 'lucide-angular';
import { LucideAngularModule } from 'lucide-angular';
import { ActivitySummary, LearningLanguage, languageLabels } from '../../domain/models';
import { ApiClient } from '../../infrastructure/api-client.service';
import { BootstrapDataService } from '../../infrastructure/bootstrap-data.service';

interface ActivityGroup {
  key: 'math' | LearningLanguage;
  label: string;
  activities: ActivitySummary[];
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <section class="screen kid-home-screen">
      <p class="status" *ngIf="loading">Načítám aktivity...</p>
      <p class="error" *ngIf="error">{{ error }}</p>

      <div class="subject-list" *ngIf="!loading">
        <section [class]="subjectClass(group)" *ngFor="let group of activityGroups">
          <h2>{{ group.label }}</h2>
          <div class="activity-grid">
            <button class="activity-card" type="button" *ngFor="let activity of group.activities" (click)="open(activity)">
              <span class="activity-icon" aria-hidden="true">
                <lucide-icon [img]="activityIcon(activity)" [size]="34"></lucide-icon>
              </span>
              <strong>{{ activityTitle(activity) }}</strong>
            </button>
          </div>
        </section>
      </div>
    </section>
  `,
})
export class HomeComponent implements OnInit {
  readonly mathIcon = Calculator;
  readonly spellingIcon = SpellCheck;
  readonly flipcardsIcon = Images;
  activities: ActivitySummary[] = [];
  activityGroups: ActivityGroup[] = [];
  loading = true;
  error: string | null = null;

  constructor(
    private readonly api: ApiClient,
    private readonly bootstrap: BootstrapDataService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const boot = this.bootstrap.read();
      this.activities = boot.catalog?.activities ?? (await this.api.catalog()).activities;
      this.activityGroups = this.groupActivities(this.activities);
    } catch {
      this.error = 'Aktivity se nepodařilo načíst.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  activityTitle(activity: ActivitySummary): string {
    if (activity.kind === 'multiplication') return activity.label;
    if (activity.kind === 'spelling') return 'Spelling';
    return 'Flipcards';
  }

  activityIcon(activity: ActivitySummary) {
    if (activity.kind === 'multiplication') return this.mathIcon;
    if (activity.kind === 'spelling') return this.spellingIcon;
    return this.flipcardsIcon;
  }

  subjectClass(group: ActivityGroup): string {
    return `subject-section subject-${group.key}`;
  }

  open(activity: ActivitySummary): void {
    void this.router.navigate(['/mode'], { queryParams: { activityId: activity.id } });
  }

  private groupActivities(activities: ActivitySummary[]): ActivityGroup[] {
    const groups: ActivityGroup[] = [
      { key: 'math', label: 'Matika', activities: [] },
      { key: 'en', label: languageLabels.en, activities: [] },
      { key: 'de', label: languageLabels.de, activities: [] },
      { key: 'es', label: languageLabels.es, activities: [] },
    ];
    const byKey = new Map<ActivityGroup['key'], ActivityGroup>(groups.map((group) => [group.key, group]));

    for (const activity of activities) {
      const key: ActivityGroup['key'] | null = activity.kind === 'multiplication' ? 'math' : activity.language;
      if (!key) continue;
      byKey.get(key)?.activities.push(activity);
    }

    return groups.filter((group) => group.activities.length > 0);
  }
}
