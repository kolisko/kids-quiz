export interface Rect { left: number; top: number; width: number; height: number; }
export interface Point { x: number; y: number; }

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.left + b.width && a.left + a.width > b.left
    && a.top < b.top + b.height && a.top + a.height > b.top;
}

export function loginFumfikDestination(current: Rect, viewport: { width: number; height: number }, obstacles: Rect[], pointer: Point, random = Math.random, occupied: Rect[] = []): Point | null {
  const padding = 18;
  const maxX = viewport.width - current.width - padding;
  const maxY = viewport.height - current.height - padding;
  if (maxX < padding || maxY < padding) return null;
  const protectedRects = obstacles.map(rect => ({ left: rect.left - padding, top: rect.top - padding,
    width: rect.width + padding * 2, height: rect.height + padding * 2 }));
  const candidates: Point[] = [];
  for (let i = 0; i < 80; i++) {
    const left = padding + random() * (maxX - padding);
    const top = padding + random() * (maxY - padding);
    const target = { left, top, width: current.width, height: current.height };
    // Reserve the entire straight movement corridor, not just its destination.
    const corridor = { left: Math.min(left, current.left), top: Math.min(top, current.top),
      width: current.width + Math.abs(left - current.left), height: current.height + Math.abs(top - current.top) };
    if (protectedRects.some(rect => overlaps(corridor, rect))) continue;
    if (occupied.some(rect => overlaps(target, { left: rect.left - 8, top: rect.top - 8, width: rect.width + 16, height: rect.height + 16 }))) continue;
    if (overlaps(target, { left: pointer.x - 25, top: pointer.y - 25, width: 50, height: 50 })) continue;
    if (Math.hypot(left - current.left, top - current.top) < Math.max(70, current.width * 0.65)) continue;
    candidates.push({ x: left - current.left, y: top - current.top });
  }
  return candidates.length ? candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))] : null;
}
