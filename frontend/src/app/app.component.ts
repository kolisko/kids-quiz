import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { House, LibraryBig, Moon, Settings, Sun, Trophy } from 'lucide-angular';
import { LucideAngularModule } from 'lucide-angular';

type ThemeMode = 'dark' | 'light';
const themeStorageKey = 'kids-quiz-theme';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterOutlet, LucideAngularModule],
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit {
  readonly homeIcon = House;
  readonly settingsIcon = Settings;
  readonly trophyIcon = Trophy;
  readonly libraryIcon = LibraryBig;
  readonly lightIcon = Sun;
  readonly darkIcon = Moon;
  theme: ThemeMode = 'dark';

  ngOnInit(): void {
    const storedTheme = window.localStorage.getItem(themeStorageKey);
    this.theme = storedTheme === 'light' ? 'light' : 'dark';
    this.applyTheme();
  }

  get themeIcon() {
    return this.theme === 'dark' ? this.lightIcon : this.darkIcon;
  }

  get themeLabel(): string {
    return this.theme === 'dark' ? 'Přepnout na světlý režim' : 'Přepnout na tmavý režim';
  }

  toggleTheme(): void {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    this.applyTheme();
  }

  private applyTheme(): void {
    document.documentElement.dataset['theme'] = this.theme;
    window.localStorage.setItem(themeStorageKey, this.theme);
  }
}
