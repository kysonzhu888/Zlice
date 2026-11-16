import { describe, expect, it } from 'vitest';
import { ClassroomGame, segmentDistance } from './game.js';

function singleFruit() {
  const game = new ClassroomGame({ width: 1000, height: 500, reducedMotion: true });
  game.setStage(2);
  return game;
}

describe('preschool fruit rules', () => {
  it('accepts a slow small movement into a fruit, without a speed threshold', () => {
    const game = singleFruit();
    game.move({ x: 418, y: 295 }, true);
    expect(game.move({ x: 421, y: 295 }, true)).toHaveLength(1);
  });
  it('detects a crossing even when neither endpoint is inside the fruit', () => {
    const game = singleFruit();
    game.move({ x: 200, y: 295 }, true);
    expect(game.move({ x: 800, y: 295 }, true)).toHaveLength(1);
    expect(game.move({ x: 200, y: 295 }, true)).toHaveLength(0);
    expect(game.collected).toBe(1);
  });
  it('does not slice on first detection or while the finger stays still', () => {
    const game = singleFruit();
    expect(game.move({ x: 500, y: 295 }, true)).toHaveLength(0);
    expect(game.move({ x: 500, y: 295 }, true)).toHaveLength(0);
  });
  it('freezes time, respawn, and collection while paused or without a hand', () => {
    const game = singleFruit();
    game.move({ x: 200, y: 295 }, true);
    game.move({ x: 800, y: 295 }, true);
    game.tick(30, false);
    expect(game.time).toBe(0);
    expect(game.move({ x: 200, y: 295 }, false)).toHaveLength(0);
    expect(game.collected).toBe(1);
  });
  it('does not create a crossing from stale positions after hand loss or pause', () => {
    const game = singleFruit();
    game.move({ x: 200, y: 295 }, true);
    game.clearPointer();
    expect(game.move({ x: 800, y: 295 }, true)).toHaveLength(0);
  });
  it('returns fruit after 1.6 active seconds and clamps a delayed animation frame', () => {
    const game = singleFruit();
    game.move({ x: 200, y: 295 }, true); game.move({ x: 800, y: 295 }, true);
    expect(game.tick(40, true)).toBe(.05);
    for (let frame = 0; frame < 32; frame++) game.tick(.05, true);
    expect(game.move({ x: 200, y: 295 }, true)).toHaveLength(1);
    expect(game.collected).toBe(2);
  });
  it('resets collection and history when changing stages or taking turns', () => {
    const game = singleFruit();
    game.move({ x: 200, y: 295 }, true); game.move({ x: 800, y: 295 }, true);
    game.setStage(3);
    expect(game.fruits).toHaveLength(3); expect(game.collected).toBe(0);
    expect(game.pointer).toBeNull(); expect(game.trail).toEqual([]);
    game.setStage(1); expect(game.fruits).toEqual([]);
  });
  it('handles zero-length collision segments without NaN', () => {
    expect(segmentDistance({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });
});
