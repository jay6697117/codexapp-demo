import { buildWsUrl, nextInput, readSnapshotSeq, type ClientInput } from './online_smoke_lib.ts';

type JoinResponse = {
  matchId: string;
  playerId: string;
  playerToken: string;
};

type ClientState = {
  id: number;
  matchId: string;
  playerId: string;
  token: string;
  ws: WebSocket | null;
  connected: boolean;
  reconnects: number;
  lastSnapshotSeq: number;
  lastSnapshotAt: number;
  inputSeq: number;
};

type SmokeOptions = {
  baseUrl: string;
  clients: number;
  durationMs: number;
  reconnectEveryMs: number;
  inputIntervalMs: number;
};

const defaults: SmokeOptions = {
  baseUrl: 'http://localhost:8000',
  clients: 4,
  durationMs: 10_000,
  reconnectEveryMs: 4_000,
  inputIntervalMs: 200
};

function parseArgs(args: string[]): SmokeOptions {
  const opts = { ...defaults };
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    const value = args[i + 1];
    if (!value) continue;
    if (key === '--base') {
      opts.baseUrl = value;
      i += 1;
    } else if (key === '--clients') {
      opts.clients = Number(value);
      i += 1;
    } else if (key === '--duration') {
      opts.durationMs = Number(value);
      i += 1;
    } else if (key === '--reconnect-every') {
      opts.reconnectEveryMs = Number(value);
      i += 1;
    } else if (key === '--input-interval') {
      opts.inputIntervalMs = Number(value);
      i += 1;
    }
  }
  return opts;
}

async function join(baseUrl: string, nickname: string): Promise<JoinResponse> {
  const res = await fetch(`${baseUrl}/api/match/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`join failed: ${res.status} ${text}`);
  }
  return (await res.json()) as JoinResponse;
}

function attachSocket(client: ClientState, baseUrl: string): void {
  const url = buildWsUrl(baseUrl, client.matchId, client.playerId, client.token);
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';
  client.ws = ws;

  ws.onopen = () => {
    client.connected = true;
    ws.send(
      JSON.stringify({
        type: 'ClientHello',
        matchId: client.matchId,
        playerId: client.playerId,
        token: client.token
      })
    );
  };

  ws.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      const snapshotSeq = readSnapshotSeq(event.data);
      client.lastSnapshotSeq = snapshotSeq;
      client.lastSnapshotAt = Date.now();
    }
  };

  ws.onclose = () => {
    client.connected = false;
  };

  ws.onerror = () => {
    client.connected = false;
  };
}

function sendInput(client: ClientState, step: number): void {
  if (!client.ws || client.ws.readyState !== WebSocket.OPEN) return;
  const input: ClientInput = nextInput(step);
  client.inputSeq = input.seq;
  client.ws.send(
    JSON.stringify({
      type: 'ClientInput',
      seq: input.seq,
      moveDir: input.moveDir,
      aimDir: input.aimDir,
      fire: input.fire
    })
  );
}

async function run(): Promise<void> {
  const opts = parseArgs(Deno.args);
  const clients: ClientState[] = [];

  for (let i = 0; i < opts.clients; i += 1) {
    const joined = await join(opts.baseUrl, `Smoke_${i}`);
    const client: ClientState = {
      id: i,
      matchId: joined.matchId,
      playerId: joined.playerId,
      token: joined.playerToken,
      ws: null,
      connected: false,
      reconnects: 0,
      lastSnapshotSeq: 0,
      lastSnapshotAt: 0,
      inputSeq: 0
    };
    attachSocket(client, opts.baseUrl);
    clients.push(client);
  }

  const inputTimer = setInterval(() => {
    const step = Math.floor(Date.now() / opts.inputIntervalMs);
    for (const client of clients) sendInput(client, step);
  }, opts.inputIntervalMs);

  const reconnectTimer = setInterval(() => {
    for (const client of clients) {
      if (!client.ws) continue;
      client.ws.close();
      client.reconnects += 1;
      attachSocket(client, opts.baseUrl);
    }
  }, opts.reconnectEveryMs);

  await new Promise((resolve) => setTimeout(resolve, opts.durationMs));
  clearInterval(inputTimer);
  clearInterval(reconnectTimer);

  for (const client of clients) {
    client.ws?.close();
  }

  const connected = clients.filter((c) => c.connected).length;
  const snapshots = clients.map((c) => c.lastSnapshotSeq);
  const latest = Math.max(0, ...snapshots);
  console.log(
    JSON.stringify(
      {
        clients: clients.length,
        connected,
        latestSnapshotSeq: latest,
        reconnects: clients.reduce((acc, c) => acc + c.reconnects, 0)
      },
      null,
      2
    )
  );
}

run().catch((err) => {
  console.error(err);
  Deno.exit(1);
});
