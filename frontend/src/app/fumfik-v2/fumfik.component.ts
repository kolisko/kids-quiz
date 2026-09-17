import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BODY_GEOMETRY, DEFAULT_FUMFIK, EAR_PATHS, FumfikPose, FumfikSpec, NOSE_PATHS, PALETTES, REST_POSE, earTransform, eyeGeometry, headGeometry, mouthGeometry, noseTransform } from './fumfik.model';

let nextId = 0;

@Component({
  selector: 'app-fumfik-v2',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './fumfik.component.html',
  styleUrl: './fumfik.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FumfikComponent implements OnChanges {
  @Input() spec: FumfikSpec = { ...DEFAULT_FUMFIK };
  @Input() pose: FumfikPose = { ...REST_POSE };
  @Input() background = true;
  @Input() guides = false;
  readonly id = `fumfik-v2-${nextId++}`;
  colors: (typeof PALETTES)[FumfikSpec['palette']] = PALETTES[this.spec.palette];
  rig: (typeof BODY_GEOMETRY)[FumfikSpec['body']] = BODY_GEOMETRY[this.spec.body];
  ears: string = EAR_PATHS[this.spec.ears];
  nose: string = NOSE_PATHS[this.spec.nose];
  earMotion = earTransform(this.spec.ears, this.pose);
  noseMotion = noseTransform(this.pose);
  eyeSpacing = 42;
  head = headGeometry(this.pose);
  eyes = [eyeGeometry(this.spec.eyes, 0, 0), eyeGeometry(this.spec.eyes, 0, 0)];
  mouth = mouthGeometry(this.spec.mouth, this.pose);
  readonly trackEye = (index: number): number => index;
  ngOnChanges(): void {
    this.colors = PALETTES[this.spec.palette];
    this.rig = BODY_GEOMETRY[this.spec.body];
    this.ears = EAR_PATHS[this.spec.ears];
    this.nose = NOSE_PATHS[this.spec.nose];
    this.earMotion = earTransform(this.spec.ears, this.pose);
    this.noseMotion = noseTransform(this.pose);
    this.eyeSpacing = 42 + 8 * Math.max(0, Math.min(1, this.pose.noseGrowth));
    this.head = headGeometry(this.pose);
    this.eyes = [eyeGeometry(this.spec.eyes, this.pose.rightBlink, this.pose.surprise), eyeGeometry(this.spec.eyes, this.pose.leftBlink, this.pose.surprise)];
    this.mouth = mouthGeometry(this.spec.mouth, this.pose);
  }
}
