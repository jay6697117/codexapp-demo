import { MAX_PLAYERS } from '../../shared/mod.ts';
import { inputKey, metaKey, snapshotKey } from './keys.ts';
import type { InputRecord, MatchMeta, SnapshotRecord } from './models.ts';

export interface RoomConnection {
  connId: string;
  matchId: string;
  slot: number;
  playerId: string;
  ws: WebSocket;
}

export class RoomManager {
  private readonly kv: Deno.Kv;
  private readonly rooms = new Map<string, MatchRoom>();

  constructor(kv: Deno.Kv) {
    this.kv = kv;
  }

  get(matchId: string): MatchRoom {
    const existing = this.rooms.get(matchId);
    if (existing) return existing;
    const room = new MatchRoom(this.kv, matchId);
    this.rooms.set(matchId, room);
    return room;
  }
}

class MatchRoom {
  private readonly kv: Deno.Kv;
  private readonly matchId: string;
  private readonly conns = new Map<string, RoomConnection>();
  private readonly relayStarted: Promise<void>;
  private relayIter?: AsyncIterator<readonly Deno.KvEntryMaybe<unknown>[]>;
  private lastSnapshotBytes: Uint8Array | null = null;

  constructor(kv: Deno.Kv, matchId: string) {
    this.kv = kv;
    this.matchId = matchId;
    this.relayStarted = this.startSnapshotRelay();
  }

  add(conn: RoomConnection): void {
    this.conns.set(conn.connId, conn);
  }

  remove(connId: string): void {
    this.conns.delete(connId);
  }

  async sendLatestSnapshotIfAny(ws: WebSocket): Promise<void> {
    await this.relayStarted;
    const bytes = this.lastSnapshotBytes;
    if (bytes) {
      try {
        ws.send(bytes);
      } catch {
        // ignore
      }
    }
  }

  broadcastSnapshot(bytes: Uint8Array): void {
    this.lastSnapshotBytes = bytes;
    for (const c of this.conns.values()) {
      if (c.ws.readyState !== WebSocket.OPEN) continue;
      try {
        c.ws.send(bytes);
      } catch {
        // ignore
      }
    }
  }

  async startSnapshotRelay(): Promise<void> {
    const key = snapshotKey(this.matchId);
    const current = await this.kv.get<SnapshotRecord>(key);
    if (current.value?.bytes) {
      this.lastSnapshotBytes = current.value.bytes;
    }

    const keys = [key];
    this.relayIter?.return?.();
    const iterator = this.kv.watch(keys)[Symbol.asyncIterator]();
    this.relayIter = iterator;
    (async () => {
      try {
        while (true) {
          const next = await iterator.next();
          if (next.done) return;
          const snap = next.value?.[0]?.value as SnapshotRecord | null;
          if (!snap?.bytes) continue;
          this.broadcastSnapshot(snap.bytes);
        }
      } catch {
        // ignore
      }
    })();
  }

  async loadMetaAndInputs(): Promise<{
    meta: MatchMeta | null;
    inputs: Array<InputRecord | null>;
    snapshot: SnapshotRecord | null;
  }> {
    const metaEntry = await this.kv.get<MatchMeta>(metaKey(this.matchId));
    const snapshotEntry = await this.kv.get<SnapshotRecord>(snapshotKey(this.matchId));
    const inputs: Array<InputRecord | null> = [];
    for (let slot = 0; slot < MAX_PLAYERS; slot += 1) {
      const entry = await this.kv.get<InputRecord>(inputKey(this.matchId, slot));
      inputs.push(entry.value ?? null);
    }
    return {
      meta: metaEntry.value ?? null,
      inputs,
      snapshot: snapshotEntry.value ?? null
    };
  }
}
