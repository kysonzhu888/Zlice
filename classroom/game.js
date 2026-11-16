// Game rules are independent of both the camera and the drawing code.
export function segmentDistance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const squared = dx * dx + dy * dy;
  const fraction = squared ? Math.max(0, Math.min(1,
    ((point.x - a.x) * dx + (point.y - a.y) * dy) / squared)) : 0;
  return Math.hypot(point.x - a.x - fraction * dx, point.y - a.y - fraction * dy);
}

export class ClassroomGame {
  constructor({ width = 1000, height = 460, reducedMotion = false } = {}) {
    this.width = width; this.height = height; this.reducedMotion = reducedMotion;
    this.stage = 0; this.reset();
  }
  reset() {
    this.collected = 0; this.time = 0; this.clearPointer();
    this.fruits = this.stage < 2 ? [] : this.stage === 2
      ? [{ type: 0, x: .5, y: .59, phase: 0, availableAt: 0 }]
      : [0, 1, 2].map(type => ({ type, x: .25 + type * .25, y: .58, phase: type * 2, availableAt: 0 }));
  }
  setStage(stage) { this.stage = Math.max(0, Math.min(3, stage)); this.reset(); }
  resize(width, height) { this.width = width; this.height = height; this.clearPointer(); }
  clearPointer() { this.pointer = null; this.strokeAnchor = null; this.trail = []; }
  radius() { return Math.min(86, Math.max(32, this.width * .069), this.height * .18); }
  position(fruit) {
    return { x: this.width * fruit.x, y: this.height * fruit.y +
      (this.reducedMotion ? 0 : Math.sin(this.time * .6 + fruit.phase) * 12) };
  }
  tick(seconds, active) {
    const dt = active ? Math.max(0, Math.min(seconds, .05)) : 0;
    this.time += dt;
    this.trail = this.trail.filter(p => this.time - p.time < .6);
    return dt;
  }
  move(point, active) {
    if (!active) { this.clearPointer(); return []; }
    const previous = this.strokeAnchor;
    this.pointer = { ...point, time: this.time };
    this.trail.push(this.pointer);
    if (this.trail.length > 36) this.trail.shift();
    if (!previous) { this.strokeAnchor = this.pointer; return []; }
    if (Math.hypot(point.x - previous.x, point.y - previous.y) < 2) return [];
    this.strokeAnchor = this.pointer;
    const hits = [];
    for (const fruit of this.fruits) {
      const position = this.position(fruit);
      const outside = Math.hypot(point.x - position.x, point.y - position.y) > this.radius() + 20;
      if (fruit.armed === false) { if (outside) fruit.armed = true; continue; }
      if (fruit.availableAt > this.time) continue;
      if (segmentDistance(position, previous, point) > this.radius() + 12) continue;
      fruit.availableAt = this.time + 1.6;
      fruit.armed = outside;
      this.collected++;
      hits.push({ ...position, type: fruit.type, radius: this.radius() });
    }
    return hits;
  }
}
