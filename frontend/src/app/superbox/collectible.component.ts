import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DEFAULT_FURNITURE, DEFAULT_PERSON, FurnitureSpec, PersonSpec, Reward } from './superbox.model';

let nextId = 0;
@Component({
  selector: 'app-collectible', standalone: true, imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './collectible.component.html',
  styles: [':host { display: block; width: 100%; height: 100%; } svg { display: block; width: 100%; height: 100%; overflow: visible; }'],
})
export class CollectibleComponent {
  @Input() reward: Reward = { kind: 'person', spec: DEFAULT_PERSON };
  @Input() label = '';
  readonly id = `collectible-${nextId++}`;
  get person(): PersonSpec { return this.reward.kind === 'person' ? this.reward.spec : DEFAULT_PERSON; }
  get furniture(): FurnitureSpec { return this.reward.kind === 'furniture' ? this.reward.spec : DEFAULT_FURNITURE; }
  get adult(): boolean { return this.person.kind === 'dad' || this.person.kind === 'mom'; }
  get dress(): boolean { return this.person.outfit === 'dress' || this.person.outfit === 'royal'; }
}
