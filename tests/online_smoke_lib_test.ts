import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildWsUrl, nextInput, readSnapshotSeq } from '../scripts/online_smoke_lib.ts';
import { encodeSnapshot } from '../shared/src/snapshot.ts';
import { MAX_PLAYERS } from '../shared/src/constants.ts';
import type { PlayerState } from '../shared/src/types.ts';

Deno.test('buildWsUrl uses ws scheme and preserves path', () => {
  const url = buildWsUrl('http://localhost:8000', 'm1', 'p1', 't1');
  assertEquals(url, 'ws://localhost:8000/ws?matchId=m1&playerId=p1&token=t1');
});

Deno.test('buildWsUrl upgrades to wss on https', () => {
  const url = buildWsUrl('https://example.com', 'm2', 'p2', 't2');
  assertEquals(url, 'wss://example.com/ws?matchId=m2&playerId=p2&token=t2');
});

Deno.test('nextInput cycles move directions', () => {
  const first = nextInput(0);
  const second = nextInput(1);
  const third = nextInput(2);
  assertEquals(first.moveDir !== second.moveDir, true);
  assertEquals(second.moveDir !== third.moveDir, true);
});

Deno.test('readSnapshotSeq matches encoded snapshot', () => {
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
  const bytes = encodeSnapshot({ snapshotSeq: 123, serverTick: 456, players });
  assertEquals(readSnapshotSeq(bytes), 123);
});
