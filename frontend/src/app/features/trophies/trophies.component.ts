import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { TrophyItem } from '../../domain/models';
import { ApiClient } from '../../infrastructure/api-client.service';
import { BootstrapDataService } from '../../infrastructure/bootstrap-data.service';

@Component({
  selector: 'app-trophies',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="screen subpage-screen">
      <div class="subpage-heading">
        <h1>Trofeje</h1>
      </div>
      <p class="status" *ngIf="loading">Načítám trofeje...</p>
      <p class="error" *ngIf="error">{{ error }}</p>
      <div class="trophy-empty" *ngIf="!loading && trophies.length === 0">Zatím žádné trofeje.</div>
      <div class="trophy-grid">
        <article class="trophy-card" *ngFor="let trophy of trophies">
          <img [src]="trophy.imagePath" alt="">
          <strong *ngIf="trophy.wonCount > 1">x{{ trophy.wonCount }}</strong>
        </article>
      </div>
    </section>
  `,
})
export class TrophiesComponent implements OnInit {
  trophies: TrophyItem[] = [];
  loading = true;
  error: string | null = null;

  constructor(
    private readonly api: ApiClient,
    private readonly bootstrap: BootstrapDataService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      this.trophies = this.bootstrap.read().trophies ?? await this.api.trophies();
    } catch {
      this.error = 'Trofeje se nepodařilo načíst.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }
}
