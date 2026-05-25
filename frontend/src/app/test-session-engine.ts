export type TestSessionOutcome = 'correct' | 'wrong';

export interface TestSessionResult {
  key: string;
  hadMistake: boolean;
}

export interface WeightedSessionItem<T> {
  key: string;
  value: T;
  weight: number;
}

export class TestSessionEngine<T> {
  private selectedItems: WeightedSessionItem<T>[] = [];
  private queue: WeightedSessionItem<T>[] = [];
  private resultsByKey = new Map<string, { hadMistake: boolean; completed: boolean }>();
  private current: WeightedSessionItem<T> | null = null;
  private lastKey: string | null = null;

  start(items: WeightedSessionItem<T>[], limit: number): void {
    this.selectedItems = this.pickUniqueWeighted(items, Math.max(1, limit));
    this.queue = [...this.selectedItems];
    this.resultsByKey = new Map(
      this.selectedItems.map((item) => [item.key, { hadMistake: false, completed: false }]),
    );
    this.current = null;
    this.lastKey = null;
  }

  next(): T | null {
    if (this.queue.length === 0) {
      this.current = null;
      return null;
    }
    const nextIndex = this.nextQueueIndex();
    const [next] = this.queue.splice(nextIndex, 1);
    this.current = next ?? null;
    this.lastKey = next?.key ?? this.lastKey;
    return next?.value ?? null;
  }

  record(outcome: TestSessionOutcome): void {
    if (!this.current) return;
    const state = this.resultsByKey.get(this.current.key);
    if (!state) return;
    if (outcome === 'correct') {
      state.completed = true;
      return;
    }
    state.hadMistake = true;
    this.requeueCurrent();
  }

  get selectedCount(): number {
    return this.selectedItems.length;
  }

  get completedCount(): number {
    let completed = 0;
    this.resultsByKey.forEach((state) => {
      if (state.completed) completed += 1;
    });
    return completed;
  }

  selectedValues(): T[] {
    return this.selectedItems.map((item) => item.value);
  }

  get finished(): boolean {
    return this.selectedItems.length > 0 && this.completedCount === this.selectedItems.length;
  }

  results(): TestSessionResult[] {
    return this.selectedItems.map((item) => ({
      key: item.key,
      hadMistake: this.resultsByKey.get(item.key)?.hadMistake ?? false,
    }));
  }

  clear(): void {
    this.selectedItems = [];
    this.queue = [];
    this.resultsByKey.clear();
    this.current = null;
    this.lastKey = null;
  }

  private pickUniqueWeighted(items: WeightedSessionItem<T>[], limit: number): WeightedSessionItem<T>[] {
    const pool = [...items];
    const selected: WeightedSessionItem<T>[] = [];
    while (pool.length > 0 && selected.length < limit) {
      const index = weightedRandomIndex(pool);
      const [item] = pool.splice(index, 1);
      if (item) selected.push(item);
    }
    return selected;
  }

  private nextQueueIndex(): number {
    if (this.queue.length <= 1) return 0;
    const candidates = this.queue
      .map((item, index) => ({ item, index }))
      .filter((candidate) => candidate.item.key !== this.lastKey);
    return randomChoice(candidates, { item: this.queue[0], index: 0 }).index;
  }

  private requeueCurrent(): void {
    if (!this.current) return;
    const item = this.current;
    this.queue = this.queue.filter((candidate) => candidate.key !== item.key);
    if (this.queue.length === 0) {
      this.queue.push(item);
      return;
    }
    const insertAt = randomInteger(1, this.queue.length);
    this.queue.splice(insertAt, 0, item);
  }
}

function weightedRandomIndex<T extends { weight: number }>(items: T[]): number {
  const totalWeight = items.reduce((sum, item) => sum + Math.max(1, Math.floor(item.weight)), 0);
  let cursor = Math.floor(Math.random() * totalWeight);
  for (let index = 0; index < items.length; index += 1) {
    cursor -= Math.max(1, Math.floor(items[index].weight));
    if (cursor < 0) return index;
  }
  return Math.max(0, items.length - 1);
}

function randomInteger(min: number, max: number): number {
  const lower = Math.ceil(min);
  const upper = Math.floor(max);
  return lower + Math.floor(Math.random() * (upper - lower + 1));
}

function randomChoice<T>(items: T[], fallback: T): T {
  return items[Math.floor(Math.random() * items.length)] ?? fallback;
}
