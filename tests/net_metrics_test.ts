import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { initSnapshotMetrics, recordSnapshot } from '../client/src/net/metrics.ts';

Deno.test('recordSnapshot updates seq and lag data', () => {
  const metrics = initSnapshotMetrics();
  const next = recordSnapshot(metrics, 10, 1000);
  assertEquals(next.lastSeq, 10);
  assertEquals(next.lastReceivedAt, 1000);
  assertEquals(next.recentReceivedAts.length, 1);
});

Deno.test('recordSnapshot computes snapshotHz', () => {
  let metrics = initSnapshotMetrics();
  metrics = recordSnapshot(metrics, 1, 0);
  metrics = recordSnapshot(metrics, 2, 100);
  metrics = recordSnapshot(metrics, 3, 200);
  assertEquals(Math.round(metrics.snapshotHz), 10);
});
