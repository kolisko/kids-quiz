import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core';
import { DEFAULT_PERSON, PersonSpec, normalizePersonSpec } from './superbox.model';
import { personGeometry } from './person-geometry';

let nextPersonId = 0;
@Component({
  selector: 'app-person-figure', standalone: true,
  templateUrl: './person-figure.component.html', changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host { display:block; width:100%; height:100%; } svg { display:block; width:100%; height:100%; overflow:visible; }'],
})
export class PersonFigureComponent implements OnChanges {
  @Input() spec: PersonSpec = DEFAULT_PERSON;
  @Input() label = '';
  readonly id = `person-${nextPersonId++}`;
  person = DEFAULT_PERSON;
  g = personGeometry(DEFAULT_PERSON);
  readonly eyePositions = [86, 114];
  readonly sides = [-1, 1];
  readonly braidBeads = [0, 1, 2, 3, 4];
  readonly curls = [[65, 44], [73, 30], [90, 25], [109, 25], [126, 32], [137, 46]];
  ngOnChanges(): void { this.person = normalizePersonSpec(this.spec); this.g = personGeometry(this.person); }
  get skirt(): boolean { return this.person.bottom.includes('skirt'); }
  get longSleeves(): boolean { return ['long-sleeve', 'long-top', 'jacket', 'hoodie'].includes(this.person.top); }
  get sleeveless(): boolean { return this.person.top === 'tank' || this.person.top === 'bra'; }
  get hairBack(): boolean { return ['long', 'bob', 'curly-long', 'floor-length'].includes(this.person.hairStyle); }
}
