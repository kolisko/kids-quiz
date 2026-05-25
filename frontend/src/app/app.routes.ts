import { Routes } from '@angular/router';
import { AssetsComponent } from './features/assets/assets.component';
import { CelebrationComponent } from './features/celebration/celebration.component';
import { HomeComponent } from './features/home/home.component';
import { LoginComponent } from './features/login/login.component';
import { ModePickerComponent } from './features/mode-picker/mode-picker.component';
import { PracticeComponent } from './features/practice/practice.component';
import { SettingsComponent } from './features/settings/settings.component';
import { TrophiesComponent } from './features/trophies/trophies.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'home', component: HomeComponent },
  { path: 'mode', component: ModePickerComponent },
  { path: 'practice', component: PracticeComponent },
  { path: 'celebration', component: CelebrationComponent },
  { path: 'settings', component: SettingsComponent },
  { path: 'assets', component: AssetsComponent },
  { path: 'trophies', component: TrophiesComponent },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: '**', redirectTo: 'login' },
];
