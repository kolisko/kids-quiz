import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LocalPreferences {
  getBoolean(key: string, fallback = false): boolean {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === 'true';
  }

  setBoolean(key: string, value: boolean): void {
    window.localStorage.setItem(key, String(value));
  }
}
