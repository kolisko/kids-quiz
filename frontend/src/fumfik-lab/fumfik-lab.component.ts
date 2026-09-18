import { ChangeDetectionStrategy, ChangeDetectorRef, Component, NgZone, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { LucideIcon } from '@lucide/angular';
import { LucideArrowLeft as ArrowLeft, LucideArrowUp as ArrowUp, LucideEar as Ear, LucideExpand as Expand, LucideEye as Eye, LucideMaximize2 as Maximize2, LucideMoveHorizontal as MoveHorizontal, LucideMoveVertical as MoveVertical, LucidePause as Pause, LucidePlay as Play, LucideRotateCcw as RotateCcw, LucideRotateCw as RotateCw, LucideShuffle as Shuffle, LucideSmile as Smile, LucideSparkles as Sparkles, LucideDynamicIcon } from '@lucide/angular';
import { SuperboxLabComponent } from './superbox/superbox-lab.component';
import { FumfikComponent } from '../app/fumfik-v2/fumfik.component';
import { DEFAULT_FUMFIK, FUMFIK_OPTIONS, FumfikParameter, FumfikPose, FumfikReaction, FumfikSpec, PALETTES, REST_POSE, randomReaction, randomSpec, reactionPose, reactionTarget, specQuery } from '../app/fumfik-v2/fumfik.model';

const LABELS: Record<string, string> = {
  round: 'Kulaté', pear: 'Hruška', bean: 'Fazole', square: 'Hranaté', triangle: 'Špičaté', floppy: 'Svěšené', tiny: 'Malé',
  dot: 'Kulaté', oval: 'Oválné', sleepy: 'Ospalé', sparkle: 'Hvězdné', heart: 'Srdce', button: 'Knoflík',
  smile: 'Úsměv', grin: 'Zubatý úsměv', open: 'Otevřená', shy: 'Nesmělá',
  coral: 'Korálová', mint: 'Mátová', sky: 'Modrá', lemon: 'Žlutá', violet: 'Fialová', berry: 'Růžová',
  plain: 'Čisté', dots: 'Tečky', waves: 'Vlny', stars: 'Hvězdy',
};

@Component({
  selector: 'app-fumfik-lab', standalone: true,
  imports: [CommonModule, FormsModule, LucideDynamicIcon, FumfikComponent, SuperboxLabComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './fumfik-lab.component.html', styleUrl: './fumfik-lab.component.css',
})
export class FumfikLabComponent implements OnDestroy {
  readonly superboxPage = new URLSearchParams(location.search).get('page') === 'superbox';
  readonly icons = { ArrowLeft, Eye, Pause, Play, RotateCcw, Shuffle, Smile, Sparkles };
  readonly palettes = PALETTES;
  readonly fields = (Object.keys(FUMFIK_OPTIONS) as FumfikParameter[]).map(key => ({
    key, label: ({ body: 'Tvar hlavy', ears: 'Uši', eyes: 'Oči', nose: 'Nos', mouth: 'Pusa', palette: 'Barva', background: 'Pozadí' })[key],
    options: FUMFIK_OPTIONS[key].map(value => ({ value, label: LABELS[value] ?? value })),
  }));
  readonly reactions: { id: FumfikReaction; label: string; icon: LucideIcon }[] = [
    { id: 'wink-right', label: 'Pravé oko fumfíka', icon: Eye },
    { id: 'wink-left', label: 'Levé oko fumfíka', icon: Eye },
    { id: 'blink', label: 'Obě oči', icon: Eye },
    { id: 'smile', label: 'Úsměv', icon: Smile },
    { id: 'surprise', label: 'Údiv', icon: Sparkles },
    { id: 'wiggle-ears', label: 'Zahýbat ušima', icon: Ear },
    { id: 'grow-nose', label: 'Zvětšit nos', icon: Maximize2 },
    { id: 'tongue-out', label: 'Vypláznout jazyk', icon: Smile },
    { id: 'shake-head', label: 'Ne, ne', icon: MoveHorizontal },
    { id: 'nod-head', label: 'Ano', icon: MoveVertical },
    { id: 'hop', label: 'Poskočit', icon: ArrowUp },
    { id: 'puff', label: 'Nafouknout hlavu', icon: Expand },
    { id: 'spin', label: 'Otočit o 360°', icon: RotateCw },
  ];
  spec = { ...DEFAULT_FUMFIK };
  pose: FumfikPose = { ...REST_POSE };
  reaction: FumfikReaction = 'wink-right';
  duration = 1100;
  intensity = 1;
  progress = 0;
  animating = false;
  animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  hold = false;
  background = true;
  guides = false;
  error = '';
  private frame: number | undefined;
  private readonly onHashChange = () => this.readHash();

  constructor(private readonly changeDetector: ChangeDetectorRef, private readonly zone: NgZone) {
    this.readHash();
    window.addEventListener('hashchange', this.onHashChange);
  }

  get status(): string { return this.animating ? 'Přehrávám' : this.progress > 0 && this.progress < 1 ? 'Zastavený výraz' : 'Klidový výraz'; }
  get query(): string { return specQuery(this.spec); }
  swatch(value: string): string { return PALETTES[value as FumfikSpec['palette']].body; }

  choose(key: FumfikParameter, value: string): void {
    this.spec = { ...this.spec, [key]: value };
    this.saveHash();
  }

  shuffle(): void { this.spec = randomSpec(); this.saveHash(); }
  shuffleReaction(): void {
    this.play(randomReaction(this.reaction));
  }
  reset(): void { this.stop(); this.spec = { ...DEFAULT_FUMFIK }; this.saveHash(); }

  play(reaction = this.reaction): void {
    this.cancelFrame();
    this.reaction = reaction;
    const start = { ...this.pose };
    if (this.hold || !this.animate) {
      this.pose = reactionTarget(reaction, this.intensity);
      this.progress = 0.45;
      return;
    }
    const began = performance.now();
    this.animating = true;
    this.zone.runOutsideAngular(() => {
      const step = (now: number) => {
        this.progress = Math.min(1, (now - began) / this.duration);
        this.pose = reactionPose(reaction, this.progress, this.intensity, start);
        this.animating = this.progress < 1;
        this.changeDetector.detectChanges();
        this.frame = this.animating ? requestAnimationFrame(step) : undefined;
      };
      this.frame = requestAnimationFrame(step);
    });
  }

  pause(): void { this.cancelFrame(); }
  stop(): void { this.cancelFrame(); this.pose = { ...REST_POSE }; this.progress = 0; }
  scrub(value: number): void { this.cancelFrame(); this.progress = Number(value); this.pose = reactionPose(this.reaction, this.progress, this.intensity); }
  holdChanged(): void { if (this.hold) this.play(); else this.stop(); }
  animationChanged(): void { this.stop(); }
  intensityChanged(): void {
    if (this.animating) return;
    if (this.progress > 0 && (this.hold || !this.animate)) this.play();
    else this.scrub(this.progress);
  }
  private cancelFrame(): void { if (this.frame !== undefined) cancelAnimationFrame(this.frame); this.frame = undefined; this.animating = false; }
  private saveHash(): void { this.error = ''; history.replaceState(null, '', `${location.pathname}${location.search}#${this.query}`); }

  private readHash(): void {
    if (this.superboxPage || !location.hash) return;
    const params = new URLSearchParams(location.hash.slice(1));
    const entries: [string, string][] = [];
    params.forEach((value, key) => entries.push([key, value]));
    const valid = entries.length === this.fields.length && this.fields.every(field => params.getAll(field.key).length === 1 && field.options.some(option => option.value === params.get(field.key)));
    if (!valid) { this.error = 'Neplatné parametry v URL.'; return; }
    this.stop();
    this.spec = Object.fromEntries(entries) as FumfikSpec;
    this.error = '';
  }

  ngOnDestroy(): void { this.cancelFrame(); window.removeEventListener('hashchange', this.onHashChange); }
}
