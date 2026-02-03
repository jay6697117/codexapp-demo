import {
  FIRE_COOLDOWN_TICKS,
  MATCH_DURATION_MS,
  MATCH_SCORE_TO_WIN,
  MAX_PLAYERS,
  PLAYER_MAX_HP,
  PLAYER_RADIUS,
  PLAYER_SPEED_PER_TICK,
  RESPAWN_TICKS,
  SERVER_TICK_HZ,
  SHOT_DAMAGE,
  SHOT_RANGE,
  WORLD_HEIGHT,
  WORLD_WIDTH
} from './constants.ts';
import { aimVector, clampInt, moveVector, normalizeAimDir, normalizeMoveDir } from './dirs.ts';
import { OBSTACLES, SPAWN_POINTS } from './map.ts';
import type { Aabb, MatchRuntimeState, PlayerInputState, PlayerState } from './types.ts';

const DEFAULT_INPUT: PlayerInputState = { seq: 0, moveDir: 0, aimDir: 0, fire: false, ts: 0 };

export function createEmptyMatchState(matchId: string): MatchRuntimeState {
  const players: PlayerState[] = [];
  for (let i = 0; i < MAX_PLAYERS; i += 1) {
    players.push({
      present: false,
      x: 0,
      y: 0,
      hp: 0,
      alive: false,
      score: 0,
      aimDir: 0,
      respawnTicks: 0,
      fireCooldownTicks: 0
    });
  }

  return {
    matchId,
    tick: 0,
    snapshotSeq: 0,
    status: 'waiting',
    startTick: 0,
    players,
    playerMask: 0
  };
}

export function applyPlayerMask(state: MatchRuntimeState, newMask: number): void {
  const mask = newMask & 0xff;
  const added = mask & ~state.playerMask;
  state.playerMask = mask;

  for (let slot = 0; slot < MAX_PLAYERS; slot += 1) {
    const bit = 1 << slot;
    if ((added & bit) !== 0) {
      spawnPlayer(state.players[slot], slot);
    }
    if ((mask & bit) === 0) {
      state.players[slot].present = false;
      state.players[slot].alive = false;
      state.players[slot].hp = 0;
      state.players[slot].score = 0;
      state.players[slot].respawnTicks = 0;
      state.players[slot].fireCooldownTicks = 0;
    }
  }
}

export function setStatusRunningIfReady(state: MatchRuntimeState): void {
  if (state.status !== 'waiting') return;

  const playerCount = countPresentPlayers(state.players);
  if (playerCount >= 2) {
    state.status = 'running';
    state.startTick = state.tick;
    return;
  }

  const waitTicks = Math.round((10 * SERVER_TICK_HZ));
  if (playerCount >= 1 && state.tick >= waitTicks) {
    state.status = 'running';
    state.startTick = state.tick;
  }
}

export function stepMatch(
  state: MatchRuntimeState,
  inputsBySlot: ReadonlyArray<PlayerInputState | undefined>
): void {
  state.tick += 1;

  if (state.status === 'waiting') {
    setStatusRunningIfReady(state);
    return;
  }
  if (state.status !== 'running') return;

  for (let slot = 0; slot < MAX_PLAYERS; slot += 1) {
    const input = inputsBySlot[slot] ?? DEFAULT_INPUT;
    stepPlayer(state.players, slot, input, OBSTACLES);
  }

  const elapsedMs = Math.round(((state.tick - state.startTick) * 1000) / SERVER_TICK_HZ);
  if (elapsedMs >= MATCH_DURATION_MS) {
    state.status = 'ended';
    return;
  }
  for (let slot = 0; slot < MAX_PLAYERS; slot += 1) {
    const p = state.players[slot];
    if (p.present && p.score >= MATCH_SCORE_TO_WIN) {
      state.status = 'ended';
      return;
    }
  }
}

function countPresentPlayers(players: ReadonlyArray<PlayerState>): number {
  let c = 0;
  for (const p of players) if (p.present) c += 1;
  return c;
}

function spawnPlayer(player: PlayerState, slot: number): void {
  const sp = SPAWN_POINTS[slot] ?? { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
  player.present = true;
  player.x = sp.x;
  player.y = sp.y;
  player.hp = PLAYER_MAX_HP;
  player.alive = true;
  player.score = player.score ?? 0;
  player.aimDir = player.aimDir ?? 0;
  player.respawnTicks = 0;
  player.fireCooldownTicks = 0;
}

function stepPlayer(
  players: PlayerState[],
  slot: number,
  input: PlayerInputState,
  obstacles: ReadonlyArray<Aabb>
): void {
  const p = players[slot];
  if (!p.present) return;

  p.aimDir = normalizeAimDir(input.aimDir);

  if (!p.alive) {
    if (p.respawnTicks > 0) {
      p.respawnTicks -= 1;
      return;
    }
    spawnPlayer(p, slot);
    return;
  }

  if (p.fireCooldownTicks > 0) p.fireCooldownTicks -= 1;

  const moveDir = normalizeMoveDir(input.moveDir);
  const { dx, dy } = moveVector(moveDir);
  if (dx !== 0 || dy !== 0) {
    moveWithCollision(p, dx, dy, obstacles);
  }

  const fire = Boolean(input.fire);
  if (fire && p.fireCooldownTicks === 0) {
    tryShoot(players, slot, obstacles);
    p.fireCooldownTicks = FIRE_COOLDOWN_TICKS;
  }
}

function moveWithCollision(p: PlayerState, dx: number, dy: number, obstacles: ReadonlyArray<Aabb>): void {
  const speedLimit = PLAYER_SPEED_PER_TICK;
  const ndx = clampInt(dx, -speedLimit, speedLimit);
  const ndy = clampInt(dy, -speedLimit, speedLimit);

  const oldX = p.x;
  const oldY = p.y;

  const x1 = clampInt(oldX + ndx, PLAYER_RADIUS, WORLD_WIDTH - PLAYER_RADIUS);
  p.x = x1;
  if (collidesAny(p, obstacles)) {
    p.x = oldX;
  }

  const y1 = clampInt(oldY + ndy, PLAYER_RADIUS, WORLD_HEIGHT - PLAYER_RADIUS);
  p.y = y1;
  if (collidesAny(p, obstacles)) {
    p.y = oldY;
  }
}

function collidesAny(p: PlayerState, obstacles: ReadonlyArray<Aabb>): boolean {
  const px = p.x;
  const py = p.y;
  const r = PLAYER_RADIUS;
  for (const o of obstacles) {
    const ex = o.x - r;
    const ey = o.y - r;
    const ew = o.w + r * 2;
    const eh = o.h + r * 2;
    if (px >= ex && px <= ex + ew && py >= ey && py <= ey + eh) {
      return true;
    }
  }
  return false;
}

function tryShoot(players: PlayerState[], shooterSlot: number, obstacles: ReadonlyArray<Aabb>): void {
  const shooter = players[shooterSlot];
  if (!shooter.present || !shooter.alive) return;

  const { dx, dy } = aimVector(shooter.aimDir);
  const ox = shooter.x;
  const oy = shooter.y;

  const maxObstacleT = raycastObstacles(ox, oy, dx, dy, SHOT_RANGE, obstacles);
  const hit = raycastPlayers(players, shooterSlot, ox, oy, dx, dy, SHOT_RANGE, maxObstacleT);
  if (!hit) return;

  const target = players[hit.slot];
  target.hp = clampInt(target.hp - SHOT_DAMAGE, 0, PLAYER_MAX_HP);
  if (target.hp > 0) return;

  target.alive = false;
  target.respawnTicks = RESPAWN_TICKS;
  shooter.score = clampInt(shooter.score + 1, 0, 65535);
}

function raycastObstacles(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  range: number,
  obstacles: ReadonlyArray<Aabb>
): number {
  let bestT = range;
  for (const o of obstacles) {
    const t = rayAabb(ox, oy, dx, dy, o.x, o.y, o.w, o.h);
    if (t !== null && t >= 0 && t < bestT) {
      bestT = t;
    }
  }
  return bestT;
}

function raycastPlayers(
  players: ReadonlyArray<PlayerState>,
  shooterSlot: number,
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  range: number,
  maxT: number
): { slot: number; t: number } | null {
  let best: { slot: number; t: number } | null = null;
  const limit = Math.min(range, maxT);
  for (let slot = 0; slot < MAX_PLAYERS; slot += 1) {
    if (slot === shooterSlot) continue;
    const p = players[slot];
    if (!p.present || !p.alive) continue;
    const t = rayCircle(ox, oy, dx, dy, p.x, p.y, PLAYER_RADIUS);
    if (t === null || t < 0 || t > limit) continue;
    if (!best || t < best.t) best = { slot, t };
  }
  return best;
}

function rayAabb(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  ax: number,
  ay: number,
  aw: number,
  ah: number
): number | null {
  const invDx = dx === 0 ? Infinity : 1 / dx;
  const invDy = dy === 0 ? Infinity : 1 / dy;

  const t1 = (ax - ox) * invDx;
  const t2 = (ax + aw - ox) * invDx;
  const t3 = (ay - oy) * invDy;
  const t4 = (ay + ah - oy) * invDy;

  const tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4));
  const tmax = Math.min(Math.max(t1, t2), Math.max(t3, t4));

  if (Number.isNaN(tmin) || Number.isNaN(tmax)) return null;
  if (tmax < 0) return null;
  if (tmin > tmax) return null;
  return tmin >= 0 ? tmin : tmax;
}

function rayCircle(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  cx: number,
  cy: number,
  r: number
): number | null {
  const fx = ox - cx;
  const fy = oy - cy;

  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;

  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);

  const t1 = (-b - s) / (2 * a);
  const t2 = (-b + s) / (2 * a);

  if (t1 >= 0) return t1;
  if (t2 >= 0) return t2;
  return null;
}
