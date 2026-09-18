import { ChangeDetectionStrategy, ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideDynamicIcon, LucideGift as Gift, LucideUsers as Users, LucideArmchair as Armchair, LucideHouse as House, LucidePlay as Play, LucidePause as Pause, LucideRotateCcw as RotateCcw, LucideDownload as Download, LucideUpload as Upload, LucidePlus as Plus, LucideCheck as Check, LucideMove as Move, LucideSparkles as Sparkles, LucideTrash2 as Trash2, LucideArrowRight as ArrowRight, LucideLockKeyhole as Lock } from '@lucide/angular';
import { CollectibleComponent } from '../../app/superbox/collectible.component';
import { SuperboxComponent } from '../../app/superbox/superbox.component';
import { HouseComponent } from '../../app/superbox/house.component';
import { DEFAULT_BOX, DEFAULT_FURNITURE, DEFAULT_HOUSE, DEFAULT_PERSON, Design, DesignKind, FURNITURE_LABELS, PERSON_LABELS, Placement, Reward, SuperboxDocument, boundPlacement, boxFrame, clamp, clone, defaultDocument, parseDocument, totalDuration } from '../../app/superbox/superbox.model';

const STORAGE_KEY = 'fumfik-superbox-lab-v1';
@Component({
  selector: 'app-superbox-lab', standalone: true,
  imports: [CommonModule, FormsModule, LucideDynamicIcon, CollectibleComponent, SuperboxComponent, HouseComponent],
  templateUrl: './superbox-lab.component.html', styleUrl: './superbox-lab.component.css', changeDetection: ChangeDetectionStrategy.Eager,
})
export class SuperboxLabComponent implements OnInit, OnDestroy {
  readonly icons = { Gift, Users, Armchair, House, Play, Pause, RotateCcw, Download, Upload, Plus, Check, Move, Sparkles, Trash2, ArrowRight, Lock };
  readonly tabs = [ { id: 'box', label: 'Superbox', icon: Gift }, { id: 'person', label: 'Osoby', icon: Users }, { id: 'furniture', label: 'Nábytek', icon: Armchair }, { id: 'house', label: 'Domky', icon: House } ] as const;
  readonly personKinds = Object.entries(PERSON_LABELS);
  readonly furnitureKinds = Object.entries(FURNITURE_LABELS);
  readonly patterns = [{ value: 'plain', label: 'Bez vzoru' }, { value: 'dots', label: 'Tečky' }, { value: 'stars', label: 'Hvězdičky' }, { value: 'stripes', label: 'Pruhy' }];
  readonly inflations = [{ value: 'puff', label: 'Nafukování', hint: 'Roste a pulzuje' }, { value: 'spin', label: 'Roztočení', hint: 'Zrychlující otočky' }, { value: 'wobble', label: 'Proměny tvarů', hint: 'Protáhne se a zavlní' }, { value: 'bounce', label: 'Poskakování', hint: 'Skáče a pruží' }];
  readonly bursts = [{ value: 'confetti', label: 'Konfety' }, { value: 'bubbles', label: 'Bublinky' }, { value: 'stars', label: 'Hvězdičky' }, { value: 'none', label: 'Bez částic' }];
  doc: SuperboxDocument = defaultDocument();
  section: DesignKind = 'box';
  libraryFilter: 'rewards' | 'box' | 'house' = 'rewards';
  designName = 'Můj Superbox';
  selectedPlacementId = '';
  elapsed = 0;
  playing = false;
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  message = '';
  error = '';
  saveStatus = 'Změny se ukládají v tomto prohlížeči';
  private frame?: number;
  constructor(private readonly cdr: ChangeDetectorRef, private readonly zone: NgZone) {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) { this.doc = parseDocument(saved); this.saveStatus = 'Načteno z tohoto prohlížeče'; }
    } catch { this.error = 'Uložený návrh se nepodařilo načíst. Zobrazuji výchozí návrhy.'; }
  }
  ngOnInit(): void { this.play(); }
  ngOnDestroy(): void { this.pause(); }
  get total(): number { return totalDuration(this.doc.box); }
  get progress(): number { return this.elapsed / this.total; }
  get phase(): string { return boxFrame(this.doc.box, this.elapsed).phase; }
  get phaseLabel(): string { return ({ waiting: 'Chvilka napětí…', inflating: 'Něco se děje!', burst: 'Překvapení!', reward: 'Nový poklad do domečku' })[this.phase] ?? ''; }
  get rewardDesign(): Design & Reward { return this.doc.library.find(d => d.id === this.doc.rewardId) as Design & Reward; }
  get personReward(): Reward { return { kind: 'person', spec: this.doc.person }; }
  get furnitureReward(): Reward { return { kind: 'furniture', spec: this.doc.furniture }; }
  get rewardDesigns(): (Design & Reward)[] { return this.doc.library.filter(d => d.kind === 'person' || d.kind === 'furniture') as (Design & Reward)[]; }
  get visibleDesigns(): Design[] {
    return this.doc.library.filter(d => this.libraryFilter === 'rewards' ? (this.section === 'person' ? d.kind === 'person' : this.section === 'furniture' ? d.kind === 'furniture' : d.kind === 'person' || d.kind === 'furniture') : d.kind === this.libraryFilter);
  }
  get selectedPlacement(): Placement | undefined { return this.doc.placements.find(p => p.id === this.selectedPlacementId); }
  get locked(): boolean { return this.doc.fumfiks < this.doc.house.cost; }
  get currentTitle(): string { return ({ box: 'Balíček plný překvapení', person: 'Malí obyvatelé velkých příběhů', furniture: 'Každý poklad má své místo', house: 'Místo pro všechny poklady' })[this.section]; }
  get currentHint(): string { return ({ box: 'Barvy, pohyb a ten okamžik překvapení. Všechno podle vás.', person: 'Vytvořte obyvatele a uložte ho mezi odměny do Superboxu.', furniture: 'Od první židle po oblíbeného medvídka. Vytvořte vlastní sadu.', house: 'Vyzkoušejte odemykání za fumfíky a zařiďte domek tahem prstu.' })[this.section]; }
  setSection(section: DesignKind): void {
    this.pause(); this.section = section; this.libraryFilter = 'rewards';
    this.designName = ({ box: 'Můj Superbox', person: PERSON_LABELS[this.doc.person.kind], furniture: FURNITURE_LABELS[this.doc.furniture.kind], house: 'Můj domeček' })[section];
    this.message = '';
  }
  changed(kind: DesignKind = this.section): void {
    if (kind === 'box') { this.doc.box = { ...this.doc.box }; this.resetAnimation(); }
    if (kind === 'person') this.doc.person = { ...this.doc.person };
    if (kind === 'furniture') this.doc.furniture = { ...this.doc.furniture };
    if (kind === 'house') {
      this.doc.house = { ...this.doc.house, cost: clamp(Math.round(this.doc.house.cost || 1), 1, 1000) };
      this.doc.placements = this.doc.placements.map(p => boundPlacement(p, this.doc.house));
    }
    this.persist();
  }
  setBox(key: 'pattern' | 'inflation' | 'burst', value: string): void { this.doc.box = { ...this.doc.box, [key]: value }; this.changed('box'); }
  resetDesign(): void {
    if (this.section === 'box') this.doc.box = { ...DEFAULT_BOX };
    if (this.section === 'person') this.doc.person = { ...DEFAULT_PERSON };
    if (this.section === 'furniture') this.doc.furniture = { ...DEFAULT_FURNITURE };
    if (this.section === 'house') this.doc.house = { ...DEFAULT_HOUSE };
    this.changed();
  }
  play(restart = true): void {
    this.pause();
    if (this.reducedMotion) { this.elapsed = this.total; return; }
    if (restart || this.elapsed >= this.total) this.elapsed = 0;
    const start = performance.now() - this.elapsed;
    this.playing = true;
    this.zone.runOutsideAngular(() => {
      const tick = (now: number) => {
        this.elapsed = Math.min(this.total, now - start);
        this.playing = this.elapsed < this.total;
        this.cdr.detectChanges();
        this.frame = this.playing ? requestAnimationFrame(tick) : undefined;
      };
      this.frame = requestAnimationFrame(tick);
    });
  }
  pause(): void { if (this.frame !== undefined) cancelAnimationFrame(this.frame); this.frame = undefined; this.playing = false; }
  resetAnimation(): void { this.pause(); this.elapsed = 0; }
  scrub(value: number): void { this.pause(); this.elapsed = clamp(Number(value), 0, 1) * this.total; }
  motionChanged(): void { if (this.reducedMotion && this.playing) { this.pause(); this.elapsed = this.total; } }
  chooseReward(id: string): void { this.doc.rewardId = id; this.resetAnimation(); this.persist(); }
  randomReward(): void {
    const pool = this.rewardDesigns.filter(d => d.id !== this.doc.rewardId);
    if (pool.length) this.chooseReward(pool[Math.floor(Math.random() * pool.length)].id);
    this.play();
  }
  saveDesign(): void {
    const name = this.designName.trim();
    if (!name) { this.error = 'Pojmenujte návrh před uložením.'; return; }
    if (this.doc.library.length >= 100) { this.error = 'Knihovna pojme 100 návrhů. Nejdříve některý odeberte.'; return; }
    const design = { id: crypto.randomUUID(), name: name.slice(0, 80), kind: this.section, spec: clone(this.doc[this.section]) } as Design;
    this.doc.library = [...this.doc.library, design];
    this.libraryFilter = design.kind === 'box' || design.kind === 'house' ? design.kind : 'rewards';
    this.persist(); this.message = `„${design.name}“ je v knihovně.`;
  }
  useDesign(design: Design): void {
    if ((design.kind === 'person' || design.kind === 'furniture') && this.section === 'box') { this.chooseReward(design.id); return; }
    if ((design.kind === 'person' || design.kind === 'furniture') && this.section === 'house') { this.addToHouse(design, design.name); return; }
    this.setSection(design.kind);
    if (design.kind === 'box') this.doc.box = clone(design.spec);
    if (design.kind === 'person') this.doc.person = clone(design.spec);
    if (design.kind === 'furniture') this.doc.furniture = clone(design.spec);
    if (design.kind === 'house') this.doc.house = clone(design.spec);
    this.designName = design.name;
    this.changed();
  }
  deleteDesign(design: Design): void {
    if ((design.kind === 'person' || design.kind === 'furniture') && this.rewardDesigns.length <= 1) { this.error = 'V knihovně musí zůstat alespoň jedna odměna.'; return; }
    this.doc.library = this.doc.library.filter(d => d.id !== design.id);
    if (this.doc.rewardId === design.id) this.chooseReward(this.rewardDesigns[0].id);
    this.persist(); this.message = `„${design.name}“ odebráno z knihovny.`;
  }
  designAction(design: Design): string { return this.section === 'house' && (design.kind === 'person' || design.kind === 'furniture') ? 'Přidat do domku' : this.section === 'box' && (design.kind === 'person' || design.kind === 'furniture') ? 'Vložit do Superboxu' : 'Upravit návrh'; }
  addToHouse(reward: Reward, name: string): void {
    if (this.locked) { this.message = `K odemčení domku chybí ${this.doc.house.cost - this.doc.fumfiks} fumfíků. Upravte zkušební počet.`; return; }
    if (this.doc.placements.length >= 40) { this.error = 'Domek pojme 40 prvků. Nejdříve některý odeberte.'; return; }
    const item = boundPlacement({ id: crypto.randomUUID(), name, reward: clone(reward), x: 35 + this.doc.placements.length % 5 * 7, y: 80, size: reward.kind === 'person' ? 19 : 20, flipped: false }, this.doc.house);
    this.doc.placements = [...this.doc.placements, item]; this.selectedPlacementId = item.id;
    this.persist(); this.message = `„${name}“ přidáno do domku.`;
  }
  placeReward(): void { const reward = this.rewardDesign; this.setSection('house'); this.addToHouse(reward, reward.name); }
  updatePlacement(key: 'size' | 'flipped', value: number | boolean): void {
    if (this.locked) return;
    this.doc.placements = this.doc.placements.map(p => p.id === this.selectedPlacementId ? boundPlacement({ ...p, [key]: value }, this.doc.house) : p);
    this.persist();
  }
  removePlacement(): void { if (this.locked) return; this.doc.placements = this.doc.placements.filter(p => p.id !== this.selectedPlacementId); this.selectedPlacementId = ''; this.persist(); }
  fumfiksChanged(): void { this.doc.fumfiks = clamp(Math.round(this.doc.fumfiks || 0), 0, 1000); this.persist(); }
  persist(): void {
    this.error = '';
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.doc)); this.saveStatus = 'Uloženo v tomto prohlížeči'; }
    catch { this.saveStatus = 'Automatické uložení není dostupné'; this.error = 'Prohlížeč návrh neuložil. Použijte Export JSON pro jeho zachování.'; }
  }
  exportDocument(): void {
    const url = URL.createObjectURL(new Blob([JSON.stringify(this.doc, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'superbox-lab.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.message = 'Návrhy a rozmístění v domku jsou připravené v JSON souboru.';
  }
  async importDocument(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement; const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 600_000) throw new Error('Soubor je příliš velký. Maximum je 600 kB.');
      const doc = parseDocument(await file.text());
      this.resetAnimation(); this.doc = doc; this.selectedPlacementId = ''; this.persist(); this.message = 'Návrhy i rozmístění byly načteny.';
    } catch (error) { this.error = error instanceof Error ? error.message : 'Soubor se nepodařilo načíst.'; }
    input.value = '';
    this.cdr.markForCheck();
  }
}
