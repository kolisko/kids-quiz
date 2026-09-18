import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CollectibleComponent } from './collectible.component';
import { DEFAULT_HOUSE, HouseSpec, Placement, boundPlacement } from './superbox.model';

let nextId = 0;
@Component({
  selector: 'app-superbox-house', standalone: true, imports: [CollectibleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush, templateUrl: './house.component.html', styleUrl: './house.component.css',
})
export class HouseComponent {
  @Input() spec: HouseSpec = DEFAULT_HOUSE;
  @Input() placements: Placement[] = [];
  @Input() selectedId = '';
  @Input() locked = false;
  @Output() placementsChange = new EventEmitter<Placement[]>();
  @Output() selectedIdChange = new EventEmitter<string>();
  @Output() interactionEnd = new EventEmitter<void>();
  readonly id = `house-${nextId++}`;
  private drag?: { pointer: number; id: string; x: number; y: number; start: Placement; width: number; height: number };
  get floors(): number[] { return Array.from({ length: this.spec.floors }, (_, i) => i); }
  get rooms(): number[] { return Array.from({ length: this.spec.rooms }, (_, i) => i); }
  startDrag(event: PointerEvent, item: Placement): void {
    if (this.locked || this.drag || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const target = event.currentTarget as HTMLElement;
    const bounds = target.parentElement!.getBoundingClientRect();
    this.selectedIdChange.emit(item.id);
    this.drag = { pointer: event.pointerId, id: item.id, x: event.clientX, y: event.clientY, start: { ...item }, width: bounds.width, height: bounds.height };
    target.setPointerCapture(event.pointerId);
  }
  moveDrag(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.pointer !== event.pointerId) return;
    const moved = boundPlacement({ ...drag.start, x: drag.start.x + (event.clientX - drag.x) / drag.width * 100, y: drag.start.y + (event.clientY - drag.y) / drag.height * 100 }, this.spec);
    this.placementsChange.emit(this.placements.map(item => item.id === drag.id ? moved : item));
  }
  endDrag(event: PointerEvent, cancel = false): void {
    if (!this.drag || this.drag.pointer !== event.pointerId) return;
    const drag = this.drag;
    this.drag = undefined;
    if (cancel) this.placementsChange.emit(this.placements.map(item => item.id === drag.id ? drag.start : item));
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    this.interactionEnd.emit();
  }
  keyMove(event: KeyboardEvent, item: Placement): void {
    if (this.locked) return;
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!direction) return;
    event.preventDefault();
    const step = event.shiftKey ? 5 : 1;
    this.selectedIdChange.emit(item.id);
    this.placementsChange.emit(this.placements.map(p => p.id === item.id ? boundPlacement({ ...p, x: p.x + direction[0] * step, y: p.y + direction[1] * step }, this.spec) : p));
    this.interactionEnd.emit();
  }
}
