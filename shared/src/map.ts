import { MAX_PLAYERS, WORLD_HEIGHT, WORLD_WIDTH } from './constants.ts';
import type { Aabb } from './types.ts';

export const MAP_ID = 'arena_v1';

export const OBSTACLES: ReadonlyArray<Aabb> = [
  { x: 180, y: 180, w: 120, h: 40 },
  { x: 724, y: 180, w: 120, h: 40 },
  { x: 180, y: 804, w: 120, h: 40 },
  { x: 724, y: 804, w: 120, h: 40 },
  { x: 492, y: 220, w: 40, h: 120 },
  { x: 492, y: 684, w: 40, h: 120 },
  { x: 220, y: 492, w: 120, h: 40 },
  { x: 684, y: 492, w: 120, h: 40 },
  { x: 400, y: 400, w: 60, h: 60 },
  { x: 564, y: 564, w: 60, h: 60 }
];

export const SPAWN_POINTS: ReadonlyArray<{ x: number; y: number }> = (() => {
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < MAX_PLAYERS; i += 1) {
    const angle = (Math.PI * 2 * i) / MAX_PLAYERS;
    const radius = 360;
    const x = Math.round(WORLD_WIDTH / 2 + Math.cos(angle) * radius);
    const y = Math.round(WORLD_HEIGHT / 2 + Math.sin(angle) * radius);
    points.push({ x, y });
  }
  return points;
})();
