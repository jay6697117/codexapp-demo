export type MatchStatus = 'waiting' | 'running' | 'ended';

export interface Aabb {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlayerInputState {
  seq: number;
  moveDir: number;
  aimDir: number;
  fire: boolean;
  ts: number;
}

export interface PlayerState {
  present: boolean;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  score: number;
  aimDir: number;
  respawnTicks: number;
  fireCooldownTicks: number;
}

export interface MatchRuntimeState {
  matchId: string;
  tick: number;
  snapshotSeq: number;
  status: MatchStatus;
  startTick: number;
  players: PlayerState[];
  playerMask: number;
}

export interface SnapshotDecoded {
  version: number;
  snapshotSeq: number;
  serverTick: number;
  players: PlayerState[];
}
