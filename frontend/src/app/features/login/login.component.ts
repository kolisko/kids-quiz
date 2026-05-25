import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiClient } from '../../infrastructure/api-client.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="screen auth-screen subpage-screen">
      <div class="subpage-heading">
        <h1>Kids Quiz</h1>
      </div>
      <form class="stack subpage-card login-card" (ngSubmit)="submit()">
        <input class="text-input" name="password" type="password" autocomplete="current-password" [(ngModel)]="password" autofocus>
        <p class="error" *ngIf="error">{{ error }}</p>
        <button class="primary-button" type="submit" [disabled]="busy || !password.trim()">
          {{ busy ? 'Ověřuji...' : 'Vstoupit' }}
        </button>
      </form>
    </section>
  `,
})
export class LoginComponent implements OnInit {
  password = '';
  busy = false;
  error: string | null = null;

  constructor(
    private readonly api: ApiClient,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    if (await this.api.session().catch(() => false)) {
      await this.router.navigateByUrl('/home');
    }
  }

  async submit(): Promise<void> {
    this.busy = true;
    this.error = null;
    try {
      const authenticated = await this.api.login(this.password);
      if (!authenticated) throw new Error('unauthorized');
      await this.router.navigateByUrl('/home');
    } catch {
      this.error = 'Heslo nesedí.';
    } finally {
      this.busy = false;
      this.cdr.detectChanges();
    }
  }
}
