import { decodeSnapshot, encodeSnapshot, snapshotByteLength } from '../src/snapshot.ts';
import { MAX_PLAYERS } from '../src/constants.ts';
import { applyPlayerMask, createEmptyMatchState, stepMatch } from '../src/sim.ts';
import type { PlayerState } from '../src/types.ts';

Deno.test('snapshot roundtrip', () => {
  const players: PlayerState[] = [];
  for (let i = 0; i < MAX_PLAYERS; i += 1) {
    players.push({
      present: true,
      x: 100 + i,
      y: 200 + i,
      hp: 100,
      alive: true,
      score: i,
      aimDir: i % 16,
      respawnTicks: 0,
      fireCooldownTicks: 0
    });
  }
  const bytes = encodeSnapshot({ snapshotSeq: 123, serverTick: 456, players });
  if (bytes.byteLength !== snapshotByteLength()) {
    throw new Error('unexpected snapshot length');
  }
  const decoded = decodeSnapshot(bytes);
  if (decoded.snapshotSeq !== 123 || decoded.serverTick !== 456) {
    throw new Error('header mismatch');
  }
  if (decoded.players.length !== MAX_PLAYERS) {
    throw new Error('player count mismatch');
  }
  for (let i = 0; i < MAX_PLAYERS; i += 1) {
    const a = decoded.players[i];
    const b = players[i];
    if (a.x !== b.x || a.y !== b.y || a.hp !== b.hp || a.score !== b.score || a.aimDir !== b.aimDir) {
      throw new Error(`player mismatch at ${i}`);
    }
  }
});

function hash32(bytes: Uint8Array): number {
  let h = 2166136261;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

Deno.test('simulation determinism (same inputs => same snapshot hash)', () => {
  const run = (): number => {
    const state = createEmptyMatchState('m_test');
    applyPlayerMask(state, 0xff);

    const inputs = Array.from({ length: MAX_PLAYERS }, (_, i) => ({
      seq: 0,
      moveDir: (i % 8) + 1,
      aimDir: (i * 3) % 16,
      fire: i % 2 === 0,
      ts: 0
    }));

    for (let t = 0; t < 180; t += 1) {
      stepMatch(state, inputs);
    }
    const bytes = encodeSnapshot({ snapshotSeq: 1, serverTick: state.tick, players: state.players });
    return hash32(bytes);
  };

  const a = run();
  const b = run();
  if (a !== b) {
    throw new Error(`hash mismatch: ${a} != ${b}`);
  }
});
