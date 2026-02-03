import {
  MAX_PLAYERS,
  SERVER_TICK_HZ,
  SNAPSHOT_HZ,
  applyPlayerMask,
  createEmptyMatchState,
  decodeSnapshot,
  encodeSnapshot,
  stepMatch
} from '../../shared/mod.ts';
import { LEADER_LEASE_MS, LEADER_RENEW_EVERY_MS } from './config.ts';
import { inputKey, leaderKey, metaKey, snapshotKey } from './keys.ts';
import type { InputRecord, LeaderLease, MatchMeta, SnapshotRecord } from './models.ts';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class CoordinatorManager {
  private readonly kv: Deno.Kv;
  private readonly instanceId: string;
  private readonly coordinators = new Map<string, MatchCoordinator>();

  constructor(kv: Deno.Kv) {
    this.kv = kv;
    this.instanceId = `${getDeployInstanceId()}:${crypto.randomUUID()}`;
  }

  ensure(matchId: string): void {
    if (this.coordinators.has(matchId)) return;
    const c = new MatchCoordinator(this.kv, matchId, this.instanceId);
    this.coordinators.set(matchId, c);
    c.start();
  }
}

class MatchCoordinator {
  private readonly kv: Deno.Kv;
  private readonly matchId: string;
  private readonly ownerId: string;
  private running = false;

  constructor(kv: Deno.Kv, matchId: string, ownerId: string) {
    this.kv = kv;
    this.matchId = matchId;
    this.ownerId = ownerId;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    (async () => {
      while (this.running) {
        const ok = await tryClaimLeader(this.kv, this.matchId, this.ownerId);
        if (ok) {
          await runLeaderSession(this.kv, this.matchId, this.ownerId);
        }
        await sleep(750);
      }
    })();
  }
}

async function runLeaderSession(kv: Deno.Kv, matchId: string, ownerId: string): Promise<void> {
  const abort = new AbortController();

  const inputs: InputRecord[] = [];
  for (let i = 0; i < MAX_PLAYERS; i += 1) inputs.push({ seq: 0, moveDir: 0, aimDir: 0, fire: false, ts: 0 });

  const state = createEmptyMatchState(matchId);

  const metaEntry = await kv.get<MatchMeta>(metaKey(matchId));
  let meta = metaEntry.value;
  if (!meta) {
    abort.abort();
    return;
  }
  state.status = meta.status;
  applyPlayerMask(state, meta.playerMask);

  const snapshotEntry = await kv.get<SnapshotRecord>(snapshotKey(matchId));
  if (snapshotEntry.value?.bytes) {
    try {
      const decoded = decodeSnapshot(snapshotEntry.value.bytes);
      state.tick = decoded.serverTick;
      state.snapshotSeq = decoded.snapshotSeq;
      for (let i = 0; i < MAX_PLAYERS; i += 1) {
        const present = state.players[i].present;
        state.players[i] = { ...state.players[i], ...decoded.players[i], present };
      }
    } catch {
      // ignore
    }
  }

  const watchKeys: Deno.KvKey[] = [metaKey(matchId)];
  for (let slot = 0; slot < MAX_PLAYERS; slot += 1) watchKeys.push(inputKey(matchId, slot));

  let lastLeaseRenewAt = 0;
  let lastPublishedStatus: MatchMeta['status'] = meta.status;

  const watchTask = (async () => {
    try {
      for await (const entries of kv.watch(watchKeys, { signal: abort.signal })) {
        const metaEntry = entries[0]?.value as MatchMeta | null;
        if (metaEntry) {
          meta = metaEntry;
          state.status = metaEntry.status;
          if (metaEntry.playerMask !== state.playerMask) {
            applyPlayerMask(state, metaEntry.playerMask);
          }
          lastPublishedStatus = metaEntry.status;
        }

        for (let slot = 0; slot < MAX_PLAYERS; slot += 1) {
          const e = entries[1 + slot];
          const v = (e?.value as InputRecord | null) ?? null;
          if (v) inputs[slot] = v;
          else inputs[slot] = { seq: 0, moveDir: 0, aimDir: 0, fire: false, ts: 0 };
        }
      }
    } catch {
      // ignore
    }
  })();

  const tickMs = Math.round(1000 / SERVER_TICK_HZ);
  let snapshotAcc = 0;

  while (!abort.signal.aborted) {
    const now = Date.now();
    if (now - lastLeaseRenewAt >= LEADER_RENEW_EVERY_MS) {
      const renewed = await tryRenewLeader(kv, matchId, ownerId);
      lastLeaseRenewAt = now;
      if (!renewed) {
        abort.abort();
        break;
      }
    }

    stepMatch(state, inputs);

    if (state.status !== lastPublishedStatus) {
      const nextMeta: MatchMeta =
        state.status === 'ended'
          ? { ...meta, status: 'ended', endsAt: Date.now(), playerMask: state.playerMask }
          : { ...meta, status: state.status, playerMask: state.playerMask };
      await kv.set(metaKey(matchId), nextMeta);
      meta = nextMeta;
      lastPublishedStatus = state.status;
    }

    snapshotAcc += SNAPSHOT_HZ;
    if (snapshotAcc >= SERVER_TICK_HZ) {
      snapshotAcc -= SERVER_TICK_HZ;
      state.snapshotSeq += 1;
      const bytes = encodeSnapshot({ snapshotSeq: state.snapshotSeq, serverTick: state.tick, players: state.players });
      const record: SnapshotRecord = { seq: state.snapshotSeq, serverTick: state.tick, bytes };
      await kv.set(snapshotKey(matchId), record);
    }

    await sleep(tickMs);
  }

  try {
    abort.abort();
  } catch {
    // ignore
  }
  await watchTask;
}

async function tryClaimLeader(kv: Deno.Kv, matchId: string, ownerId: string): Promise<boolean> {
  const now = Date.now();
  const entry = await kv.get<LeaderLease>(leaderKey(matchId));
  const lease = entry.value;

  if (lease && lease.leaseUntil > now && lease.owner !== ownerId) {
    return false;
  }

  if (lease && lease.owner === ownerId && lease.leaseUntil > now) {
    return true;
  }

  if (lease && lease.leaseUntil > now) return false;

  const next: LeaderLease = { owner: ownerId, leaseUntil: now + LEADER_LEASE_MS };
  const commit = await kv
    .atomic()
    .check({ key: leaderKey(matchId), versionstamp: entry.versionstamp })
    .set(leaderKey(matchId), next)
    .commit();
  return commit.ok;
}

async function tryRenewLeader(kv: Deno.Kv, matchId: string, ownerId: string): Promise<boolean> {
  const now = Date.now();
  const entry = await kv.get<LeaderLease>(leaderKey(matchId));
  const lease = entry.value;
  if (!lease) return false;
  if (lease.owner !== ownerId) return false;
  if (lease.leaseUntil < now) return false;

  const next: LeaderLease = { owner: ownerId, leaseUntil: now + LEADER_LEASE_MS };
  const commit = await kv
    .atomic()
    .check({ key: leaderKey(matchId), versionstamp: entry.versionstamp })
    .set(leaderKey(matchId), next)
    .commit();
  return commit.ok;
}

function getDeployInstanceId(): string {
  return (
    Deno.env.get('DENO_DEPLOYMENT_ID') ??
    Deno.env.get('DENO_REGION') ??
    Deno.env.get('DENO_DEPLOY_REGION') ??
    'local'
  );
}
