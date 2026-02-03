import { serveDir } from 'https://deno.land/std@0.224.0/http/file_server.ts';
import {
  MAX_PLAYERS,
  SERVER_TICK_HZ,
  SNAPSHOT_HZ,
  createEmptyMatchState,
  applyPlayerMask,
  stepMatch,
  encodeSnapshot,
  decodeSnapshot,
  type PlayerInputState,
  type MatchRuntimeState
} from '../shared/src/index.ts';

type MatchMeta = {
  status: 'waiting' | 'running' | 'ended';
  createdAt: number;
};

type LeaderRecord = {
  owner: string;
  leaseUntil: number;
};

type PlayerRecord = {
  nickname: string;
  slot: number;
  joinedAt: number;
};

type TokenRecord = {
  token: string;
};

const kv = await Deno.openKv();
const matchRuntimes = new Map<string, MatchRuntime>();
const runtimeOwner = `${Deno.env.get('DENO_DEPLOYMENT_ID') ?? 'local'}:${crypto.randomUUID()}`;

const META_KEY = (matchId: string) => ['match', matchId, 'meta'] as const;
const LEADER_KEY = (matchId: string) => ['match', matchId, 'leader'] as const;
const PLAYER_KEY = (matchId: string, playerId: string) => ['match', matchId, 'player', playerId] as const;
const SLOT_KEY = (matchId: string, slot: number) => ['match', matchId, 'slot', slot] as const;
const TOKEN_KEY = (matchId: string, playerId: string) => ['match', matchId, 'token', playerId] as const;
const INPUT_KEY = (matchId: string, playerId: string) => ['match', matchId, 'input', playerId] as const;
const SNAPSHOT_KEY = (matchId: string) => ['match', matchId, 'snapshot'] as const;
const WAITING_KEY = (matchId: string) => ['match', 'waiting', matchId] as const;

const DEFAULT_INPUT: PlayerInputState = { seq: 0, moveDir: 0, aimDir: 0, fire: false, ts: 0 };

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.pathname === '/ws') return handleWebSocket(req);
  if (url.pathname.startsWith('/api/')) return handleApi(req, url);
  return serveDir(req, {
    fsRoot: new URL('./public', import.meta.url).pathname,
    urlRoot: '',
    showDirListing: false
  });
});

async function handleApi(req: Request, url: URL): Promise<Response> {
  if (req.method === 'POST' && url.pathname === '/api/match/join') {
    return handleJoin(req);
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/match/')) {
    const matchId = url.pathname.split('/')[3];
    if (!matchId) return json({ error: 'missing matchId' }, 400);
    return handleMatchState(matchId);
  }
  return json({ error: 'not found' }, 404);
}

async function handleJoin(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const nickname = typeof body.nickname === 'string' ? body.nickname : 'player';

  const playerId = crypto.randomUUID();
  const token = crypto.randomUUID();

  const allocation = await allocateSlot(playerId);
  if (!allocation) return json({ error: 'no available match' }, 503);

  const { matchId, slot } = allocation;
  const now = Date.now();

  await kv.set(PLAYER_KEY(matchId, playerId), { nickname, slot, joinedAt: now } satisfies PlayerRecord, {
    expireIn: 15 * 60 * 1000
  });
  await kv.set(TOKEN_KEY(matchId, playerId), { token } satisfies TokenRecord, {
    expireIn: 15 * 60 * 1000
  });

  const metaEntry = await kv.get<MatchMeta>(META_KEY(matchId));
  const meta: MatchMeta = metaEntry.value ?? { status: 'waiting', createdAt: now };
  const playerCount = await countPlayers(matchId);
  if (meta.status === 'waiting' && playerCount >= 2) {
    meta.status = 'running';
  }
  await kv.set(META_KEY(matchId), meta);

  if (playerCount >= MAX_PLAYERS) {
    await kv.delete(WAITING_KEY(matchId));
  }

  return json({ matchId, playerId, playerToken: token });
}

async function handleMatchState(matchId: string): Promise<Response> {
  const [meta, leader, snapshot] = await Promise.all([
    kv.get<MatchMeta>(META_KEY(matchId)),
    kv.get<LeaderRecord>(LEADER_KEY(matchId)),
    kv.get<{ snapshotSeq: number }>(SNAPSHOT_KEY(matchId))
  ]);
  const players = await listPlayers(matchId);
  return json({
    meta: meta.value ?? null,
    leader: leader.value ?? null,
    snapshotSeq: snapshot.value?.snapshotSeq ?? 0,
    players
  });
}

async function handleWebSocket(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const matchId = url.searchParams.get('matchId');
  const playerId = url.searchParams.get('playerId');
  const token = url.searchParams.get('token');
  if (!matchId || !playerId || !token) return json({ error: 'missing params' }, 400);

  const [tokenEntry, playerEntry] = await Promise.all([
    kv.get<TokenRecord>(TOKEN_KEY(matchId, playerId)),
    kv.get<PlayerRecord>(PLAYER_KEY(matchId, playerId))
  ]);
  if (!tokenEntry.value || tokenEntry.value.token !== token) {
    return json({ error: 'unauthorized' }, 401);
  }
  if (!playerEntry.value) {
    return json({ error: 'unknown player' }, 404);
  }

  const { socket, response } = Deno.upgradeWebSocket(req, { idleTimeout: 25 });
  const runtime = getMatchRuntime(matchId);

  socket.onopen = () => {
    runtime.clients.add(socket);
    sendWelcome(socket, playerEntry.value!.slot);
  };

  socket.onmessage = async (event) => {
    if (typeof event.data !== 'string') return;
    let msg: unknown;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    const type = (msg as { type?: unknown }).type;
    if (type === 'ClientHello') {
      sendWelcome(socket, playerEntry.value!.slot);
      return;
    }
    if (type === 'ClientInput') {
      const input: PlayerInputState = {
        seq: Number((msg as { seq?: unknown }).seq ?? 0),
        moveDir: Number((msg as { moveDir?: unknown }).moveDir ?? 0),
        aimDir: Number((msg as { aimDir?: unknown }).aimDir ?? 0),
        fire: Boolean((msg as { fire?: unknown }).fire),
        ts: Date.now()
      };
      const sig = `${input.moveDir}|${input.aimDir}|${input.fire ? 1 : 0}`;
      const lastSig = runtime.lastInputSig.get(playerId);
      if (sig !== lastSig) {
        runtime.lastInputSig.set(playerId, sig);
        runtime.lastInputs.set(playerId, input);
        await kv.set(INPUT_KEY(matchId, playerId), input, { expireIn: 10_000 });
      }
    }
  };

  socket.onclose = () => {
    runtime.clients.delete(socket);
    if (runtime.clients.size === 0) runtime.releaseIfIdle();
  };

  socket.onerror = () => {
    runtime.clients.delete(socket);
  };

  return response;
}

function sendWelcome(socket: WebSocket, slot: number): void {
  socket.send(JSON.stringify({ type: 'ServerWelcome', slot }));
}

type MatchRuntime = {
  matchId: string;
  clients: Set<WebSocket>;
  lastSnapshotSeq: number;
  lastInputs: Map<string, PlayerInputState>;
  lastInputSig: Map<string, string>;
  state: MatchRuntimeState | null;
  inputWatchAbort?: AbortController;
  inputWatchKeySig?: string;
  snapshotWatchAbort?: AbortController;
  leaderInterval?: number;
  tickInterval?: number;
  isLeader: boolean;
  ownerId: string;
  releaseIfIdle: () => void;
};

function getMatchRuntime(matchId: string): MatchRuntime {
  const existing = matchRuntimes.get(matchId);
  if (existing) return existing;

  const runtime: MatchRuntime = {
    matchId,
    clients: new Set(),
    lastSnapshotSeq: 0,
    lastInputs: new Map(),
    lastInputSig: new Map(),
    state: null,
    isLeader: false,
    ownerId: runtimeOwner,
    releaseIfIdle: () => {
      if (runtime.clients.size > 0) return;
      stopMatchRuntime(runtime);
      matchRuntimes.delete(matchId);
    }
  };

  startSnapshotWatch(runtime);
  startLeaderLoop(runtime);
  matchRuntimes.set(matchId, runtime);
  return runtime;
}

function stopMatchRuntime(runtime: MatchRuntime): void {
  runtime.snapshotWatchAbort?.abort();
  runtime.inputWatchAbort?.abort();
  if (runtime.leaderInterval) clearInterval(runtime.leaderInterval);
  if (runtime.tickInterval) clearInterval(runtime.tickInterval);
}

function startSnapshotWatch(runtime: MatchRuntime): void {
  const abort = new AbortController();
  runtime.snapshotWatchAbort?.abort();
  runtime.snapshotWatchAbort = abort;

  (async () => {
    for await (const entries of kv.watch([SNAPSHOT_KEY(runtime.matchId)], { signal: abort.signal })) {
      const entry = entries[0];
      if (!entry?.value) continue;
      const value = entry.value as { snapshotSeq: number; serverTick: number; bytes: Uint8Array };
      runtime.lastSnapshotSeq = value.snapshotSeq;
      for (const client of runtime.clients) {
        try {
          client.send(value.bytes);
        } catch {
          runtime.clients.delete(client);
        }
      }
    }
  })();
}

function startLeaderLoop(runtime: MatchRuntime): void {
  runtime.leaderInterval = setInterval(async () => {
    const now = Date.now();
    const leaseUntil = now + 5000;
    const current = await kv.get<LeaderRecord>(LEADER_KEY(runtime.matchId));
    const canAcquire = !current.value || current.value.leaseUntil < now || current.value.owner === runtime.ownerId;
    if (!canAcquire) {
      if (runtime.isLeader) {
        runtime.isLeader = false;
        if (runtime.tickInterval) clearInterval(runtime.tickInterval);
      }
      return;
    }

    const ok = await kv
      .atomic()
      .check(current)
      .set(LEADER_KEY(runtime.matchId), { owner: runtime.ownerId, leaseUntil }, { expireIn: 6000 })
      .commit();

    if (ok && !runtime.isLeader) {
      runtime.isLeader = true;
      startTickLoop(runtime);
    }
  }, 1000);
}

function startTickLoop(runtime: MatchRuntime): void {
  const tickMs = Math.floor(1000 / SERVER_TICK_HZ);
  const snapshotEvery = Math.max(1, Math.round(SERVER_TICK_HZ / SNAPSHOT_HZ));

  runtime.tickInterval = setInterval(async () => {
    const players = await listPlayers(runtime.matchId);
    if (players.length === 0) return;

    if (!runtime.state) {
      runtime.state = createEmptyMatchState(runtime.matchId);
      const snapshotEntry = await kv.get<{ bytes: Uint8Array }>(SNAPSHOT_KEY(runtime.matchId));
      if (snapshotEntry.value?.bytes) {
        const decoded = decodeSnapshot(snapshotEntry.value.bytes);
        runtime.state.players = decoded.players;
        runtime.state.tick = decoded.serverTick;
        runtime.state.snapshotSeq = decoded.snapshotSeq;
      }
    }

    const mask = players.reduce((acc, p) => acc | (1 << p.slot), 0);
    applyPlayerMask(runtime.state, mask);

    await refreshInputWatch(runtime, players.map((p) => p.playerId));

    const inputs: PlayerInputState[] = Array.from({ length: MAX_PLAYERS }, () => ({ ...DEFAULT_INPUT }));
    for (const p of players) {
      const input = runtime.lastInputs.get(p.playerId);
      if (input) inputs[p.slot] = input;
    }

    stepMatch(runtime.state, inputs);

    if (runtime.state.tick % snapshotEvery === 0) {
      runtime.state.snapshotSeq += 1;
      const bytes = encodeSnapshot({
        snapshotSeq: runtime.state.snapshotSeq,
        serverTick: runtime.state.tick,
        players: runtime.state.players
      });
      await kv.set(SNAPSHOT_KEY(runtime.matchId), {
        snapshotSeq: runtime.state.snapshotSeq,
        serverTick: runtime.state.tick,
        bytes
      });
    }
  }, tickMs);
}

async function refreshInputWatch(runtime: MatchRuntime, playerIds: string[]): Promise<void> {
  const keys = playerIds.map((pid) => INPUT_KEY(runtime.matchId, pid));
  if (keys.length === 0 || keys.length > 10) return;
  const keySig = keys.map((k) => k.join(':')).join('|');
  if (runtime.inputWatchKeySig === keySig) return;

  runtime.inputWatchAbort?.abort();
  const abort = new AbortController();
  runtime.inputWatchAbort = abort;
  runtime.inputWatchKeySig = keySig;

  (async () => {
    for await (const entries of kv.watch(keys, { signal: abort.signal })) {
      for (const entry of entries) {
        if (!entry?.value) continue;
        const pid = entry.key[3] as string;
        runtime.lastInputs.set(pid, entry.value as PlayerInputState);
      }
    }
  })();
}

async function allocateSlot(playerId: string): Promise<{ matchId: string; slot: number } | null> {
  for await (const entry of kv.list({ prefix: ['match', 'waiting'] }, { limit: 5 })) {
    const matchId = entry.key[2] as string;
    const slot = await assignSlot(matchId, playerId);
    if (slot !== null) return { matchId, slot };
  }
  const matchId = crypto.randomUUID();
  await kv.set(WAITING_KEY(matchId), { createdAt: Date.now() }, { expireIn: 15 * 60 * 1000 });
  await kv.set(META_KEY(matchId), { status: 'waiting', createdAt: Date.now() } satisfies MatchMeta);
  const slot = await assignSlot(matchId, playerId);
  if (slot === null) return null;
  return { matchId, slot };
}

async function assignSlot(matchId: string, playerId: string): Promise<number | null> {
  for (let slot = 0; slot < MAX_PLAYERS; slot += 1) {
    const key = SLOT_KEY(matchId, slot);
    const entry = await kv.get<{ playerId: string }>(key);
    if (entry.value) continue;
    const ok = await kv
      .atomic()
      .check(entry)
      .set(key, { playerId }, { expireIn: 15 * 60 * 1000 })
      .commit();
    if (ok) return slot;
  }
  return null;
}

async function listPlayers(matchId: string): Promise<Array<{ playerId: string; slot: number }>> {
  const players: Array<{ playerId: string; slot: number }> = [];
  for await (const entry of kv.list<PlayerRecord>({ prefix: ['match', matchId, 'player'] })) {
    const playerId = entry.key[3] as string;
    players.push({ playerId, slot: entry.value.slot });
  }
  players.sort((a, b) => a.slot - b.slot);
  return players;
}

async function countPlayers(matchId: string): Promise<number> {
  let count = 0;
  for await (const _entry of kv.list({ prefix: ['match', matchId, 'player'] })) {
    count += 1;
  }
  return count;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}
