import type { MatchStatus } from '../../shared/mod.ts';

export interface MatchMeta {
  status: MatchStatus;
  seed: number;
  mapId: string;
  createdAt: number;
  endsAt?: number;
  playerMask: number;
}

export interface LeaderLease {
  owner: string;
  leaseUntil: number;
}

export interface PlayerRecord {
  playerId: string;
  tokenHash: string;
  nickname: string;
  joinedAt: number;
}

export interface InputRecord {
  seq: number;
  moveDir: number;
  aimDir: number;
  fire: boolean;
  ts: number;
}

export interface SnapshotRecord {
  seq: number;
  serverTick: number;
  bytes: Uint8Array;
}

