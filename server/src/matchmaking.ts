import { MAP_ID, MAX_PLAYERS } from '../../shared/mod.ts';
import { INPUT_EXPIRE_IN_MS } from './config.ts';
import { randomToken, sha256Base64Url } from './crypto.ts';
import { matchmakingOpenKey, metaKey, inputKey, playerKey } from './keys.ts';
import type { InputRecord, MatchMeta, PlayerRecord } from './models.ts';

export interface JoinResult {
  matchId: string;
  playerId: string;
  playerToken: string;
}

const DEFAULT_INPUT: InputRecord = { seq: 0, moveDir: 0, aimDir: 0, fire: false, ts: 0 };

export async function joinMatch(kv: Deno.Kv, nickname: string): Promise<JoinResult> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const open = await kv.get<string>(matchmakingOpenKey());
    const matchId = open.value ?? createMatchId();
    const res = await tryJoinMatchId(kv, matchId, nickname);
    if (res) return res;

    await kv.set(matchmakingOpenKey(), createMatchId());
  }
  const matchId = createMatchId();
  const res = await tryJoinMatchId(kv, matchId, nickname);
  if (!res) throw new Error('Failed to join match');
  return res;
}

function createMatchId(): string {
  return `m_${crypto.randomUUID()}`;
}

async function tryJoinMatchId(kv: Deno.Kv, matchId: string, nickname: string): Promise<JoinResult | null> {
  const metaEntry = await kv.get<MatchMeta>(metaKey(matchId));
  const meta = metaEntry.value ?? createNewMeta();
  if (meta.status === 'ended') return null;
  if ((meta.playerMask & 0xff) === 0xff) return null;

  const slot = firstFreeSlot(meta.playerMask);
  if (slot === null) return null;

  const playerId = `p${slot}_${crypto.randomUUID()}`;
  const playerToken = randomToken('t');
  const tokenHash = await sha256Base64Url(playerToken);

  const nextMask = meta.playerMask | (1 << slot);
  const nextStatus = countBits(nextMask) >= 2 ? 'running' : meta.status;
  const nextMeta: MatchMeta = { ...meta, playerMask: nextMask, status: nextStatus };

  const playerRecord: PlayerRecord = {
    playerId,
    tokenHash,
    nickname,
    joinedAt: Date.now()
  };

  const tx = kv
    .atomic()
    .check({ key: metaKey(matchId), versionstamp: metaEntry.versionstamp })
    .set(metaKey(matchId), nextMeta)
    .set(playerKey(matchId, slot), playerRecord)
    .set(inputKey(matchId, slot), DEFAULT_INPUT, { expireIn: INPUT_EXPIRE_IN_MS });

  const commit = await tx.commit();
  if (!commit.ok) return null;

  await kv.set(matchmakingOpenKey(), matchId);
  return { matchId, playerId, playerToken };
}

function createNewMeta(): MatchMeta {
  return {
    status: 'waiting',
    seed: Math.floor(Math.random() * 1_000_000_000),
    mapId: MAP_ID,
    createdAt: Date.now(),
    playerMask: 0
  };
}

function firstFreeSlot(mask: number): number | null {
  for (let i = 0; i < MAX_PLAYERS; i += 1) {
    if ((mask & (1 << i)) === 0) return i;
  }
  return null;
}

function countBits(n: number): number {
  let x = n & 0xff;
  let c = 0;
  while (x) {
    x &= x - 1;
    c += 1;
  }
  return c;
}
