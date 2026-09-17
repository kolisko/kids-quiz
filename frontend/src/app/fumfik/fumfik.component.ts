import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, NgZone, OnChanges, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FumfikComponent as FumfikV2Component } from '../fumfik-v2/fumfik.component';
import { FumfikPose, FumfikReaction, FumfikSpec, REST_POSE, randomReaction, reactionPose } from '../fumfik-v2/fumfik.model';

export interface FumfikAppearance {
  version: 0 | 1 | 2;
  imagePath: string | null;
  spec: FumfikSpec | null;
}

@Component({
  selector: 'app-fumfik',
  standalone: true,
  imports: [CommonModule, FumfikV2Component],
  template: `
    <app-fumfik-v2 *ngIf="appearance.version === 2 && appearance.spec; else legacy"
      [spec]="appearance.spec" [pose]="pose" />
    <ng-template #legacy>
      <img *ngIf="appearance.imagePath" class="fumfik-image" [src]="appearance.imagePath" alt="Fumfík" draggable="false">
    </ng-template>
  `,
  styles: [`
    :host { display: block; width: 100%; aspect-ratio: 1; }
    img { display: block; width: 100%; height: 100%; object-fit: contain; }
  `],
  host: { '[attr.data-version]': 'appearance.version', '[attr.data-reaction]': 'animating ? lastReaction : null' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FumfikAvatarComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) appearance!: FumfikAppearance;
  pose: FumfikPose = { ...REST_POSE };
  lastReaction?: FumfikReaction;
  animating = false;
  private frame?: number;

  constructor(private readonly changeDetector: ChangeDetectorRef, private readonly zone: NgZone) {}

  react(): void {
    if (this.appearance.version !== 2 || !this.appearance.spec) return;
    this.cancelFrame();
    const reaction = randomReaction(this.lastReaction, Math.random, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.lastReaction = reaction;
    const start = { ...this.pose };
    const began = performance.now();
    this.animating = true;
    this.zone.runOutsideAngular(() => {
      const step = (now: number) => {
        const progress = Math.min(1, (now - began) / 1100);
        this.pose = reactionPose(reaction, progress, 1, start);
        this.animating = progress < 1;
        this.changeDetector.detectChanges();
        this.frame = this.animating ? requestAnimationFrame(step) : undefined;
      };
      this.frame = requestAnimationFrame(step);
    });
  }

  ngOnChanges(): void { this.cancelFrame(); this.pose = { ...REST_POSE }; this.lastReaction = undefined; }
  ngOnDestroy(): void { this.cancelFrame(); }
  private cancelFrame(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.animating = false;
  }
}
