export type SnapshotMetrics = {
  lastSeq: number;
  lastReceivedAt: number;
  recentReceivedAts: number[];
  snapshotHz: number;
};

export function initSnapshotMetrics(): SnapshotMetrics {
  return {
    lastSeq: 0,
    lastReceivedAt: 0,
    recentReceivedAts: [],
    snapshotHz: 0
  };
}

export function recordSnapshot(
  metrics: SnapshotMetrics,
  snapshotSeq: number,
  receivedAt: number
): SnapshotMetrics {
  const times = metrics.recentReceivedAts.slice(-4);
  times.push(receivedAt);

  let snapshotHz = metrics.snapshotHz;
  if (times.length >= 2) {
    const span = times[times.length - 1] - times[0];
    const intervals = times.length - 1;
    if (span > 0) snapshotHz = (intervals * 1000) / span;
  }

  return {
    lastSeq: snapshotSeq,
    lastReceivedAt: receivedAt,
    recentReceivedAts: times,
    snapshotHz
  };
}
