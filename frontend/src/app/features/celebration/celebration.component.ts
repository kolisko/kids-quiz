import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { House, PartyPopper } from 'lucide-angular';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-celebration',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <section class="celebration-screen">
      <div class="celebration-badge" aria-hidden="true">
        <lucide-icon [img]="partyIcon" [size]="42"></lucide-icon>
      </div>
      <img class="celebration-animal" [src]="imagePath" alt="">
      <h1>Skvělá práce!</h1>
      <p>Trofej je tvoje.</p>
      <button class="kid-action-button primary" type="button" (click)="router.navigateByUrl('/home')">
        <lucide-icon [img]="homeIcon" [size]="26"></lucide-icon>
        <span>Další trénink</span>
      </button>
    </section>
  `,
})
export class CelebrationComponent {
  readonly partyIcon = PartyPopper;
  readonly homeIcon = House;
  readonly animalKey: string;
  readonly imagePath: string;

  constructor(
    private readonly route: ActivatedRoute,
    readonly router: Router,
  ) {
    this.animalKey = this.route.snapshot.queryParamMap.get('animalKey') ?? 'animal-01';
    this.imagePath = `/assets/animals/${this.animalKey}.svg`;
  }
}
