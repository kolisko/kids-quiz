import { bootstrapApplication } from '@angular/platform-browser';
import { FumfikLabComponent } from './fumfik-lab.component';

async function startLab(): Promise<void> {
  const response = await fetch('/api/auth/status', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error('auth_status_failed');
  const status = await response.json();
  if (!status.authenticated || status.user?.role !== 'admin') {
    window.location.replace('/');
    return;
  }
  await bootstrapApplication(FumfikLabComponent);
}

window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
startLab().catch(() => {
  const message = document.getElementById('lab-status');
  if (message) message.textContent = 'Přístup se nepodařilo ověřit. Obnovte stránku nebo se vraťte do aplikace.';
});
