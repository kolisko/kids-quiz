import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LEVEL_LABELS, formatTime } from './timed-arithmetic.model';

@Component({
  selector: 'app-timed-arithmetic-settings', standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="settings-section">
      <h2>Počítání na čas do 20</h2>
      <div class="limits">
        <label *ngFor="let label of labels; let index = index">
          {{ index + 1 }}. {{ label }} (sekundy)
          <input type="number" min="10" max="600" step="1" inputmode="numeric"
            [disabled]="loading || saving"
            [attr.name]="'timedLevel' + index" [(ngModel)]="draft[index]" (ngModelChange)="message = ''">
        </label>
      </div>
      <p class="settings-note">Celkový čas {{ time(total) }}</p>
      <button class="secondary-button compact-button" type="button" (click)="save()" [disabled]="loading || saving || !valid || !dirty">{{ saving ? 'Ukládám…' : 'Uložit časové limity' }}</button>
      <p class="settings-note" *ngIf="message" role="status">{{ message }}</p>
      <p class="error" *ngIf="error" role="alert">{{ error }}</p>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .limits { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
    label { display: flex; flex-direction: column; gap: 8px; font-size: 18px; font-weight: 600; }
    input { width: 100%; min-width: 0; }
    @media (max-width: 600px) { .limits { grid-template-columns: 1fr; } }
  `],
})
export class TimedArithmeticSettingsComponent implements OnChanges {
  @Input({ required: true }) seconds!: number[];
  @Input() loading = false;
  @Output() updated = new EventEmitter<number[]>();
  readonly labels = LEVEL_LABELS;
  readonly time = formatTime;
  draft = [120, 120, 120];
  saving = false;
  message = '';
  error = '';
  ngOnChanges(): void { this.draft = [...this.seconds]; }
  get valid(): boolean { return this.draft.length === 3 && this.draft.every(n => Number.isInteger(n) && n >= 10 && n <= 600); }
  get dirty(): boolean { return this.draft.some((n, index) => n !== this.seconds[index]); }
  get total(): number { return this.draft.reduce((sum, n) => sum + (Number(n) || 0), 0); }
  async save(): Promise<void> {
    if (this.loading || this.saving || !this.valid) return;
    this.saving = true;
    this.error = '';
    this.message = '';
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timedArithmeticSeconds: this.draft }), signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error();
      const settings = await response.json();
      this.seconds = settings.timedArithmeticSeconds;
      this.draft = [...this.seconds];
      this.updated.emit(this.seconds);
      this.message = 'Časové limity jsou uložené.';
    } catch { this.error = 'Časové limity se nepodařilo uložit.'; }
    finally { this.saving = false; }
  }
}
