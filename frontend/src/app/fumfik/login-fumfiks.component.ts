import { Component, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FumfikAppearance, FumfikAvatarComponent } from './fumfik.component';
import { FUMFIK_OPTIONS, randomSpec } from '../fumfik-v2/fumfik.model';
import { loginFumfikDestination } from './login-fumfik-motion';

@Component({
  selector: 'app-login-fumfiks', standalone: true,
  imports: [CommonModule, FumfikAvatarComponent],
  template: `
    <div class="login-fumfik-background">
      <div *ngFor="let item of items; let index = index" #figure class="login-fumfik"
        [ngClass]="'login-fumfik-' + (index + 1)" [style.translate]="item.x + 'px ' + item.y + 'px'">
        <button class="fumfik-reactor" type="button" (pointerenter)="move($event, figure, index)"
          (click)="fumfik.react()" aria-label="Náhodná reakce fumfíka">
          <app-fumfik #fumfik [appearance]="item.appearance"></app-fumfik>
        </button>
      </div>
    </div>
  `,
  styleUrl: './login-fumfiks.component.css',
})
export class LoginFumfiksComponent {
  readonly items = FUMFIK_OPTIONS.palette.map((palette, index) => ({
    appearance: { version: 2, imagePath: null,
      spec: { ...randomSpec(), palette, body: FUMFIK_OPTIONS.body[index % FUMFIK_OPTIONS.body.length] },
    } as FumfikAppearance,
    x: 0, y: 0,
  }));
  private nextMoveAt = 0;

  constructor(private readonly element: ElementRef<HTMLElement>) {}

  move(event: PointerEvent, figure: HTMLElement, index: number): void {
    const item = this.items[index];
    const now = performance.now();
    if (event.pointerType !== 'mouse' || now < this.nextMoveAt || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const panels = this.element.nativeElement.closest('.login-screen')?.querySelectorAll<HTMLElement>('.login-panel, .trophy-leaderboard') ?? [];
    const obstacles = Array.from(panels, panel => panel.getBoundingClientRect());
    const occupied = Array.from(this.element.nativeElement.querySelectorAll<HTMLElement>('.login-fumfik'))
      .filter(other => other !== figure).map(other => other.getBoundingClientRect());
    const delta = loginFumfikDestination(figure.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight },
      obstacles, { x: event.clientX, y: event.clientY }, Math.random, occupied);
    this.nextMoveAt = now + 1500;
    if (!delta) return;
    item.x += delta.x;
    item.y += delta.y;
  }

  @HostListener('window:resize') resetPositions(): void {
    this.items.forEach(item => { item.x = 0; item.y = 0; });
    this.nextMoveAt = performance.now() + 1500;
  }
}
