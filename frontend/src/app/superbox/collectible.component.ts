import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DEFAULT_FURNITURE, DEFAULT_PERSON, FurnitureSpec, Reward } from './superbox.model';
import { PersonFigureComponent } from './person-figure.component';

let nextId = 0;
@Component({
  selector: 'app-collectible', standalone: true, imports: [CommonModule, PersonFigureComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './collectible.component.html',
  styles: [':host { display: block; width: 100%; height: 100%; } svg { display: block; width: 100%; height: 100%; overflow: visible; }'],
})
export class CollectibleComponent {
  @Input() reward: Reward = { kind: 'person', spec: DEFAULT_PERSON };
  @Input() label = '';
  readonly id = `collectible-${nextId++}`;
  get furniture(): FurnitureSpec { return this.reward.kind === 'furniture' ? this.reward.spec : DEFAULT_FURNITURE; }
}
