import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core';
import { CollectibleComponent } from './collectible.component';
import { BoxSpec, DEFAULT_BOX, DEFAULT_PERSON, Reward, boxFrame, particleFrame } from './superbox.model';

let nextId = 0;
@Component({
  selector: 'app-superbox', standalone: true, imports: [CollectibleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './superbox.component.html',
  styles: [`:host { display:block; width:100%; aspect-ratio: 6/5; } .stage { position:relative; width:100%; height:100%; isolation:isolate; }
    svg { width:100%; height:100%; display:block; overflow:visible; } .reward { position:absolute; width:38%; height:46%; left:31%; top:23%; transform-origin:50% 70%; }
    .aura { position:absolute; inset:14% 18%; border-radius:50%; background:radial-gradient(ellipse, #f5d8a120, transparent 65%); z-index:-1; }
  `],
})
export class SuperboxComponent implements OnChanges {
  @Input() spec: BoxSpec = DEFAULT_BOX;
  @Input() reward: Reward = { kind: 'person', spec: DEFAULT_PERSON };
  @Input() elapsed = 0;
  @Input() reducedMotion = false;
  readonly id = `superbox-${nextId++}`;
  frame = boxFrame(this.spec, 0);
  particles: ReturnType<typeof particleFrame>[] = [];
  readonly starPoints = '0,-8 2.3,-2.5 8,-2.5 3.6,1.5 5,7 0,4 -5,7 -3.6,1.5 -8,-2.5 -2.3,-2.5';
  ngOnChanges(): void {
    this.frame = boxFrame(this.spec, this.elapsed);
    this.particles = this.frame.opened && !this.reducedMotion && this.spec.burst !== 'none'
      ? Array.from({ length: this.spec.particles }, (_, i) => particleFrame(i, this.spec.particles, this.frame.burst, this.spec.burst === 'bubbles')) : [];
  }
}
