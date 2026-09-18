import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideArrowLeft, LucideCheck, LucideDynamicIcon, LucidePackage, LucideTimer, LucideTrophy, LucideX } from '@lucide/angular';
import { FumfikAvatarComponent } from '../fumfik/fumfik.component';
import { LEVEL_LABELS, TimedArithmeticEngine, TimedResult, TimedRun, TimedSummary, formatTime } from './timed-arithmetic.model';

@Component({
  selector: 'app-timed-arithmetic', standalone: true,
  imports: [CommonModule, LucideDynamicIcon, FumfikAvatarComponent],
  templateUrl: './timed-arithmetic.component.html', styleUrl: './timed-arithmetic.component.css',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class TimedArithmeticComponent implements OnDestroy {
  @Input({ required: true }) summary!: TimedSummary;
  @Output() exit = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();
  @Output() unauthorized = new EventEmitter<void>();
  @Output() startFailed = new EventEmitter<string>();
  readonly icons = { back: LucideArrowLeft, timer: LucideTimer, trophy: LucideTrophy, box: LucidePackage, check: LucideCheck, wrong: LucideX };
  readonly labels = LEVEL_LABELS;
  readonly time = formatTime;
  phase: 'ready' | 'starting' | 'playing' | 'saving' | 'result' = 'ready';
  engine: TimedArithmeticEngine | null = null;
  result: TimedResult | null = null;
  error = '';
  countdown = 3;
  private run: TimedRun | null = null;
  private requestId = crypto.randomUUID();
  private startedAt = 0;
  private startedWall = 0;
  private timer?: number;
  private destroyed = false;
  private requestAbort?: AbortController;

  constructor(private readonly changeDetector: ChangeDetectorRef) {}

  get duration(): number { return this.summary.levels.reduce((sum, level) => sum + level.seconds, 0); }
  get awardedCount(): number { return this.result?.levels.filter(level => level.trophy).length ?? 0; }

  async start(): Promise<void> {
    if (this.phase !== 'ready') return;
    this.phase = 'starting';
    this.error = '';
    try {
      const run = await this.post<TimedRun>('runs', { requestId: this.requestId });
      if (this.destroyed) return;
      this.run = run;
      this.summary = run.summary;
      this.engine = new TimedArithmeticEngine(run.summary.levels);
      const untilStart = run.startsAt - run.serverNow;
      this.startedAt = performance.now() + untilStart;
      this.startedWall = Date.now() + untilStart;
      this.phase = 'playing';
      this.update();
      this.timer = window.setInterval(() => this.update(), 100);
    } catch {
      if (!this.destroyed) {
        this.phase = 'ready'; this.error = 'Hru se nepodařilo spustit. Zkus to znovu.';
        this.startFailed.emit('timed_arithmetic_start_failed');
      }
    }
    this.render();
  }

  reveal(): void { this.engine?.reveal(this.elapsed()); this.update(); }
  answer(correct: boolean): void { this.engine?.record(correct, this.elapsed()); this.update(); }

  private elapsed(): number {
    // Use a deadline, not interval ticks; sleep/background throttling must not grant extra time.
    return Math.max(performance.now() - this.startedAt, Date.now() - this.startedWall);
  }

  private update(): void {
    if (this.phase !== 'playing' || !this.engine) return;
    const elapsed = this.elapsed();
    this.countdown = Math.max(0, Math.ceil(-elapsed / 1000));
    this.engine.tick(elapsed);
    if (this.engine.finished) {
      window.clearInterval(this.timer);
      this.timer = undefined;
      void this.save();
    }
    this.render();
  }

  async save(): Promise<void> {
    if (!this.run || !this.engine?.finished || (this.phase === 'saving' && !this.error)) return;
    this.phase = 'saving';
    this.error = '';
    try {
      const result = await this.post<TimedResult>(`runs/${this.run.id}/finish`, { levels: this.engine.attempts });
      if (this.destroyed) return;
      this.result = result;
      this.phase = 'result';
      this.saved.emit();
    } catch {
      if (!this.destroyed) this.error = 'Výsledky se nepodařilo uložit. Zůstávají tady připravené k opakování.';
    }
    this.render();
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    this.requestAbort = new AbortController();
    const timeout = window.setTimeout(() => this.requestAbort?.abort(), 15000);
    try {
      const response = await fetch(`/api/timed-arithmetic/${path}`, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: this.requestAbort.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (response.status === 401) this.unauthorized.emit();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json() as T;
    } finally { window.clearTimeout(timeout); }
  }

  ngOnDestroy(): void { this.destroyed = true; window.clearInterval(this.timer); this.requestAbort?.abort(); }
  private render(): void { if (!this.destroyed) this.changeDetector.detectChanges(); }
}
