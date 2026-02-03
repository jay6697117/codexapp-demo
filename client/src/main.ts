import * as PIXI from 'pixi.js';
import './styles.css';
import {
  MAX_PLAYERS,
  SNAPSHOT_HZ,
  SERVER_TICK_HZ,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  decodeSnapshot,
  encodeSnapshot,
  createEmptyMatchState,
  applyPlayerMask,
  stepMatch,
  OBSTACLES
} from '@shared/index.ts';
import { initSnapshotMetrics, recordSnapshot } from './net/metrics.ts';

type SnapshotDecoded = ReturnType<typeof decodeSnapshot>;

type NetSnapshot = {
  receivedAt: number;
  data: SnapshotDecoded;
};

type Mode = 'menu' | 'connecting' | 'online' | 'offline';

function requireElement<T extends Element>(el: T | null, name: string): T {
  if (!el) {
    throw new Error(`Missing DOM element: ${name}`);
  }
  return el;
}

const overlay = requireElement(document.querySelector<HTMLDivElement>('#overlay'), 'overlay');
const startBtn = requireElement(document.querySelector<HTMLButtonElement>('#start-btn'), 'start-btn');
const canvasWrap = requireElement(document.querySelector<HTMLDivElement>('#canvas-wrap'), 'canvas-wrap');

const app = new PIXI.Application();
const graphics = new PIXI.Graphics();
const hudText = new PIXI.Text({ text: '', style: { fill: 0xffffff, fontSize: 14 } });
const forceOffline = new URLSearchParams(window.location.search).has('offline');
let appReady = false;

const state = {
  mode: 'menu' as Mode,
  ws: null as WebSocket | null,
  connected: false,
  matchId: '',
  playerId: '',
  token: '',
  slot: 0,
  lastInputSig: '',
  inputSeq: 0,
  mouseX: WORLD_WIDTH / 2,
  mouseY: WORLD_HEIGHT / 2,
  mouseDown: false,
  keys: new Set<string>(),
  lastFrameAt: performance.now(),
  accumulatorMs: 0,
  localState: createEmptyMatchState('local'),
  localEnabled: false,
  localSnapshot: null as SnapshotDecoded | null,
  netSnapshots: [] as NetSnapshot[],
  renderSnapshot: null as SnapshotDecoded | null,
  snapshotMetrics: initSnapshotMetrics(),
  leaderOwner: '',
  leaderUpdatedAt: 0,
  leaderInterval: 0
};

async function bootstrap(): Promise<void> {
  await app.init({
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    backgroundColor: 0x0f141c,
    antialias: false,
    resolution: window.devicePixelRatio || 1,
    autoStart: false,
    preserveDrawingBuffer: true
  });
  appReady = true;

  canvasWrap.appendChild(app.canvas);
  app.stage.addChild(graphics);
  app.stage.addChild(hudText);
  hudText.position.set(12, 12);

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mousedown', () => (state.mouseDown = true));
  window.addEventListener('mouseup', () => (state.mouseDown = false));
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);

  startBtn.addEventListener('click', () => startGame());

  setupLocalMatch();
  requestAnimationFrame(loop);
}

function startGame(): void {
  overlay.classList.add('hidden');
  if (forceOffline) {
    startOffline();
    return;
  }
  state.mode = 'connecting';
  connectOnline().catch(() => {
    startOffline();
  });
}

async function connectOnline(): Promise<void> {
  const baseUrl = getServerBase();
  const res = await fetch(`${baseUrl}/api/match/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname: `Player_${Math.floor(Math.random() * 1000)}` })
  });
  if (!res.ok) throw new Error('join failed');
  const data = (await res.json()) as { matchId: string; playerId: string; playerToken: string };
  state.matchId = data.matchId;
  state.playerId = data.playerId;
  state.token = data.playerToken;

  const wsUrl = new URL('/ws', baseUrl || window.location.href);
  wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  wsUrl.searchParams.set('matchId', state.matchId);
  wsUrl.searchParams.set('playerId', state.playerId);
  wsUrl.searchParams.set('token', state.token);

  const ws = new WebSocket(wsUrl.toString());
  ws.binaryType = 'arraybuffer';
  state.ws = ws;

  ws.onopen = () => {
    ws.send(
      JSON.stringify({
        type: 'ClientHello',
        matchId: state.matchId,
        playerId: state.playerId,
        token: state.token
      })
    );
  };

  ws.onmessage = (event) => {
    if (typeof event.data === 'string') {
      handleServerMessage(event.data);
      return;
    }
    if (event.data instanceof ArrayBuffer) {
      const bytes = new Uint8Array(event.data);
      handleSnapshotBytes(bytes);
      return;
    }
    if (event.data instanceof Blob) {
      event.data.arrayBuffer().then((buf) => handleSnapshotBytes(new Uint8Array(buf)));
    }
  };

  ws.onclose = () => {
    state.connected = false;
    if (state.mode === 'online') startOffline();
  };
}

function getServerBase(): string {
  const envBase = import.meta.env.VITE_SERVER_URL;
  if (envBase && envBase.length > 0) return envBase.replace(/\/$/, '');
  return '';
}

function handleServerMessage(raw: string): void {
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (!msg || typeof msg !== 'object') return;
  const type = (msg as { type?: unknown }).type;
  if (type === 'ServerWelcome') {
    const data = msg as { slot: number };
    state.slot = Number.isFinite(data.slot) ? Number(data.slot) : 0;
    state.connected = true;
    state.mode = 'online';
    state.localEnabled = false;
    state.netSnapshots = [];
    state.snapshotMetrics = initSnapshotMetrics();
    startLeaderPolling();
  }
}

function handleSnapshotBytes(bytes: Uint8Array): void {
  try {
    const decoded = decodeSnapshot(bytes);
    const entry: NetSnapshot = { receivedAt: performance.now(), data: decoded };
    state.netSnapshots.push(entry);
    if (state.netSnapshots.length > 2) state.netSnapshots.shift();
    state.snapshotMetrics = recordSnapshot(state.snapshotMetrics, decoded.snapshotSeq, entry.receivedAt);
  } catch {
    // ignore
  }
}

function startOffline(): void {
  state.mode = 'offline';
  state.connected = false;
  state.localEnabled = true;
  state.netSnapshots = [];
  stopLeaderPolling();
}

function setupLocalMatch(): void {
  const mask = 0x0f;
  applyPlayerMask(state.localState, mask);
  state.localState.status = 'running';
  state.localEnabled = true;
}

function handleKeyDown(ev: KeyboardEvent): void {
  state.keys.add(ev.key.toLowerCase());
  if (ev.key.toLowerCase() === 'f') toggleFullscreen();
}

function handleKeyUp(ev: KeyboardEvent): void {
  state.keys.delete(ev.key.toLowerCase());
}

function handleMouseMove(ev: MouseEvent): void {
  if (!appReady) return;
  const rect = app.canvas.getBoundingClientRect();
  state.mouseX = ((ev.clientX - rect.left) / rect.width) * WORLD_WIDTH;
  state.mouseY = ((ev.clientY - rect.top) / rect.height) * WORLD_HEIGHT;
}

function computeMoveDir(): number {
  const up = state.keys.has('w') || state.keys.has('arrowup');
  const down = state.keys.has('s') || state.keys.has('arrowdown');
  const left = state.keys.has('a') || state.keys.has('arrowleft');
  const right = state.keys.has('d') || state.keys.has('arrowright');

  const dx = (right ? 1 : 0) + (left ? -1 : 0);
  const dy = (down ? 1 : 0) + (up ? -1 : 0);

  if (dx === 0 && dy === 0) return 0;
  if (dx === 0 && dy === -1) return 1;
  if (dx === 1 && dy === -1) return 2;
  if (dx === 1 && dy === 0) return 3;
  if (dx === 1 && dy === 1) return 4;
  if (dx === 0 && dy === 1) return 5;
  if (dx === -1 && dy === 1) return 6;
  if (dx === -1 && dy === 0) return 7;
  if (dx === -1 && dy === -1) return 8;
  return 0;
}

function computeAimDir(playerX: number, playerY: number): number {
  const angle = Math.atan2(state.mouseY - playerY, state.mouseX - playerX);
  const normalized = angle < 0 ? angle + Math.PI * 2 : angle;
  const dir = Math.round((normalized / (Math.PI * 2)) * 16) % 16;
  return dir;
}

function buildInput(): { moveDir: number; aimDir: number; fire: boolean } {
  const snapshot = getRenderSnapshot();
  const local = snapshot?.players[state.slot];
  const px = local?.x ?? WORLD_WIDTH / 2;
  const py = local?.y ?? WORLD_HEIGHT / 2;
  return {
    moveDir: computeMoveDir(),
    aimDir: computeAimDir(px, py),
    fire: state.mouseDown
  };
}

function sendInputIfNeeded(): void {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN || !state.connected) return;
  const input = buildInput();
  const sig = `${input.moveDir}|${input.aimDir}|${input.fire ? 1 : 0}`;
  if (sig === state.lastInputSig) return;
  state.lastInputSig = sig;
  state.inputSeq += 1;
  state.ws.send(
    JSON.stringify({
      type: 'ClientInput',
      seq: state.inputSeq,
      moveDir: input.moveDir,
      aimDir: input.aimDir,
      fire: input.fire
    })
  );
}

function stepLocal(): void {
  const inputs = Array.from({ length: MAX_PLAYERS }, () => ({
    seq: 0,
    moveDir: 0,
    aimDir: 0,
    fire: false,
    ts: 0
  }));

  const player = state.localState.players[0];
  if (player?.present) {
    const input = buildInput();
    inputs[0] = { seq: 0, moveDir: input.moveDir, aimDir: input.aimDir, fire: input.fire, ts: Date.now() };
  }

  for (let slot = 1; slot < MAX_PLAYERS; slot += 1) {
    if (!state.localState.players[slot]?.present) continue;
    const moveDir = ((Math.floor(state.localState.tick / 20) + slot) % 8) + 1;
    const aimDir = (Math.floor(state.localState.tick / 30) + slot * 2) % 16;
    const fire = state.localState.tick % (20 + slot) === 0;
    inputs[slot] = { seq: 0, moveDir, aimDir, fire, ts: Date.now() };
  }

  stepMatch(state.localState, inputs);
  state.localState.snapshotSeq += 1;
  const bytes = encodeSnapshot({
    snapshotSeq: state.localState.snapshotSeq,
    serverTick: state.localState.tick,
    players: state.localState.players
  });
  state.localSnapshot = decodeSnapshot(bytes);
}

function getRenderSnapshot(): SnapshotDecoded | null {
  if (state.mode === 'online' && state.netSnapshots.length > 0) {
    const now = performance.now();
    const delay = 1000 / SNAPSHOT_HZ;
    const target = now - delay;
    const [a, b] = state.netSnapshots.length === 1 ? [state.netSnapshots[0], state.netSnapshots[0]] : state.netSnapshots;
    if (!a || !b) return state.netSnapshots[state.netSnapshots.length - 1]?.data ?? null;
    if (a === b) return a.data;
    if (target <= a.receivedAt) return a.data;
    if (target >= b.receivedAt) return b.data;
    const t = (target - a.receivedAt) / (b.receivedAt - a.receivedAt || 1);
    return interpolateSnapshots(a.data, b.data, t);
  }
  if (state.localSnapshot) return state.localSnapshot;
  return null;
}

function interpolateSnapshots(a: SnapshotDecoded, b: SnapshotDecoded, t: number): SnapshotDecoded {
  if (a.players.length !== b.players.length) return b;
  const players = a.players.map((p, i) => {
    const q = b.players[i];
    return {
      ...p,
      x: p.x + (q.x - p.x) * t,
      y: p.y + (q.y - p.y) * t,
      hp: q.hp,
      alive: q.alive,
      score: q.score,
      aimDir: q.aimDir,
      respawnTicks: q.respawnTicks,
      fireCooldownTicks: q.fireCooldownTicks
    };
  });
  return {
    version: b.version,
    snapshotSeq: b.snapshotSeq,
    serverTick: b.serverTick,
    players
  };
}

function update(dtMs: number): void {
  if (state.localEnabled) {
    state.accumulatorMs += dtMs;
    const stepMs = 1000 / SERVER_TICK_HZ;
    while (state.accumulatorMs >= stepMs) {
      stepLocal();
      state.accumulatorMs -= stepMs;
    }
  }

  if (state.mode === 'online') {
    sendInputIfNeeded();
  }

  state.renderSnapshot = getRenderSnapshot();
}

function render(): void {
  if (!appReady) return;
  graphics.clear();
  graphics.beginFill(0x0f141c);
  graphics.drawRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  graphics.endFill();
  graphics.lineStyle(2, 0x263040);
  graphics.drawRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  graphics.beginFill(0x2b3648);
  for (const obs of OBSTACLES) {
    graphics.drawRect(obs.x, obs.y, obs.w, obs.h);
  }
  graphics.endFill();

  const snapshot = state.renderSnapshot;
  if (snapshot) {
    snapshot.players.forEach((p, idx) => {
      if (!p.present) return;
      const color = idx === state.slot ? 0x38ef7d : 0xff6b6b;
      const alpha = p.alive ? 1 : 0.35;
      graphics.beginFill(color, alpha);
      graphics.drawCircle(p.x, p.y, 10);
      graphics.endFill();
      if (p.alive) {
        const aimAngle = (Math.PI * 2 * p.aimDir) / 16;
        const lx = p.x + Math.cos(aimAngle) * 18;
        const ly = p.y + Math.sin(aimAngle) * 18;
        graphics.lineStyle(2, color, 0.8);
        graphics.moveTo(p.x, p.y);
        graphics.lineTo(lx, ly);
        graphics.lineStyle(0);
      }
    });
  }

  const local = snapshot?.players[state.slot];
  const now = performance.now();
  const lagMs = state.snapshotMetrics.lastReceivedAt
    ? Math.max(0, Math.round(now - state.snapshotMetrics.lastReceivedAt))
    : 0;
  const leaderAge = state.leaderUpdatedAt ? Math.round((Date.now() - state.leaderUpdatedAt) / 1000) : 0;
  hudText.text = [
    `mode: ${state.mode}`,
    `match: ${state.matchId || 'local'}`,
    `player: ${state.playerId || 'local'}`,
    `hp: ${local?.hp ?? 0}`,
    `score: ${local?.score ?? 0}`,
    `snap: ${snapshot?.snapshotSeq ?? 0}`,
    `hz: ${state.snapshotMetrics.snapshotHz.toFixed(1)}`,
    `lag: ${lagMs}ms`,
    `leader: ${state.leaderOwner || 'n/a'} (${leaderAge}s)`
  ].join('\n');

  app.render();
}

function loop(now: number): void {
  const dt = now - state.lastFrameAt;
  state.lastFrameAt = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

function resizeCanvas(): void {
  const maxWidth = window.innerWidth - 24;
  const maxHeight = window.innerHeight - 24;
  const scale = Math.min(maxWidth / WORLD_WIDTH, maxHeight / WORLD_HEIGHT, 1);
  if (!appReady) return;
  app.canvas.style.width = `${WORLD_WIDTH * scale}px`;
  app.canvas.style.height = `${WORLD_HEIGHT * scale}px`;
}

function toggleFullscreen(): void {
  const doc = document as Document & { fullscreenElement?: Element | null };
  if (doc.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
    return;
  }
  if (!appReady) return;
  app.canvas.requestFullscreen().catch(() => {});
}

function startLeaderPolling(): void {
  if (state.leaderInterval) return;
  if (!state.matchId) return;
  state.leaderInterval = window.setInterval(async () => {
    try {
      const res = await fetch(`/api/match/${state.matchId}/state`);
      if (!res.ok) return;
      const data = (await res.json()) as { leader?: { owner?: string } | null };
      const owner = data.leader?.owner ?? '';
      if (owner !== state.leaderOwner) {
        state.leaderOwner = owner;
        state.leaderUpdatedAt = Date.now();
      }
    } catch {
      // ignore
    }
  }, 5000);
}

function stopLeaderPolling(): void {
  if (state.leaderInterval) window.clearInterval(state.leaderInterval);
  state.leaderInterval = 0;
  state.leaderOwner = '';
  state.leaderUpdatedAt = 0;
}

function renderGameToText(): string {
  const snapshot = state.renderSnapshot;
  const payload = {
    mode: state.mode,
    coordinateSystem: 'origin top-left, x right, y down',
    snapshotSeq: snapshot?.snapshotSeq ?? 0,
    serverTick: snapshot?.serverTick ?? 0,
    localSlot: state.slot,
    players: snapshot?.players.map((p) => ({
      present: p.present,
      x: Math.round(p.x),
      y: Math.round(p.y),
      hp: p.hp,
      alive: p.alive,
      score: p.score,
      aimDir: p.aimDir
    })) ?? [],
    input: buildInput(),
    connection: {
      connected: state.connected,
      matchId: state.matchId || 'local'
    }
  };
  return JSON.stringify(payload);
}

function advanceTime(ms: number): void {
  const stepMs = 1000 / SERVER_TICK_HZ;
  let remaining = ms;
  while (remaining > 0) {
    const chunk = Math.min(stepMs, remaining);
    update(chunk);
    remaining -= chunk;
  }
  render();
}

window.render_game_to_text = renderGameToText;
window.advanceTime = advanceTime;

bootstrap().catch((err) => {
  console.error(err);
});
