import { MAX_PLAYERS, SNAPSHOT_VERSION, WORLD_HEIGHT, WORLD_WIDTH } from './constants.ts';
import { clampInt } from './dirs.ts';
import type { PlayerState, SnapshotDecoded } from './types.ts';

const HEADER_BYTES = 1 + 4 + 4 + 1;
const PLAYER_BYTES = 14;

export function snapshotByteLength(): number {
  return HEADER_BYTES + MAX_PLAYERS * PLAYER_BYTES;
}

export function encodeSnapshot(params: {
  snapshotSeq: number;
  serverTick: number;
  players: ReadonlyArray<PlayerState>;
}): Uint8Array {
  const bytes = new Uint8Array(snapshotByteLength());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let o = 0;
  view.setUint8(o, SNAPSHOT_VERSION);
  o += 1;
  view.setUint32(o, params.snapshotSeq >>> 0, true);
  o += 4;
  view.setUint32(o, params.serverTick >>> 0, true);
  o += 4;
  view.setUint8(o, MAX_PLAYERS);
  o += 1;

  for (let i = 0; i < MAX_PLAYERS; i += 1) {
    const p = params.players[i];
    const present = p?.present ? 1 : 0;
    view.setUint8(o, present);
    o += 1;

    const x = present ? clampInt(Math.round(p.x), 0, WORLD_WIDTH) : 0;
    const y = present ? clampInt(Math.round(p.y), 0, WORLD_HEIGHT) : 0;
    view.setUint16(o, x, true);
    o += 2;
    view.setUint16(o, y, true);
    o += 2;

    const hp = present ? clampInt(Math.round(p.hp), 0, 255) : 0;
    view.setUint8(o, hp);
    o += 1;

    const alive = present && p.alive ? 1 : 0;
    view.setUint8(o, alive);
    o += 1;

    const score = present ? clampInt(Math.round(p.score), 0, 65535) : 0;
    view.setUint16(o, score, true);
    o += 2;

    const aimDir = present ? clampInt(Math.round(p.aimDir), 0, 15) : 0;
    view.setUint8(o, aimDir);
    o += 1;

    const respawnTicks = present ? clampInt(Math.round(p.respawnTicks), 0, 65535) : 0;
    view.setUint16(o, respawnTicks, true);
    o += 2;

    const fireCooldownTicks = present ? clampInt(Math.round(p.fireCooldownTicks), 0, 65535) : 0;
    view.setUint16(o, fireCooldownTicks, true);
    o += 2;
  }

  return bytes;
}

export function decodeSnapshot(bytes: Uint8Array): SnapshotDecoded {
  if (bytes.byteLength < HEADER_BYTES) {
    throw new Error('Invalid snapshot: too short');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 0;
  const version = view.getUint8(o);
  o += 1;
  const snapshotSeq = view.getUint32(o, true);
  o += 4;
  const serverTick = view.getUint32(o, true);
  o += 4;
  const playerCount = view.getUint8(o);
  o += 1;

  if (playerCount !== MAX_PLAYERS) {
    throw new Error(`Invalid snapshot: playerCount=${playerCount}`);
  }
  const expected = snapshotByteLength();
  if (bytes.byteLength !== expected) {
    throw new Error(`Invalid snapshot: length=${bytes.byteLength}, expected=${expected}`);
  }

  const players: PlayerState[] = [];
  for (let i = 0; i < MAX_PLAYERS; i += 1) {
    const present = view.getUint8(o) === 1;
    o += 1;
    const x = view.getUint16(o, true);
    o += 2;
    const y = view.getUint16(o, true);
    o += 2;
    const hp = view.getUint8(o);
    o += 1;
    const alive = view.getUint8(o) === 1;
    o += 1;
    const score = view.getUint16(o, true);
    o += 2;
    const aimDir = view.getUint8(o);
    o += 1;
    const respawnTicks = view.getUint16(o, true);
    o += 2;
    const fireCooldownTicks = view.getUint16(o, true);
    o += 2;

    players.push({
      present,
      x,
      y,
      hp,
      alive: present ? alive : false,
      score,
      aimDir,
      respawnTicks,
      fireCooldownTicks
    });
  }

  return { version, snapshotSeq, serverTick, players };
}
