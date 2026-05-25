import { Injectable, NgZone } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TimerService {
  private timerId: number | null = null;

  constructor(private readonly zone: NgZone) {}

  start(seconds: number, tick: (secondsLeft: number) => void, done: () => void): void {
    this.stop();
    let left = Math.max(1, seconds);
    tick(left);
    this.timerId = window.setInterval(() => {
      this.zone.run(() => {
        left -= 1;
        tick(left);
        if (left <= 0) {
          this.stop();
          done();
        }
      });
    }, 1000);
  }

  stop(): void {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }
}
