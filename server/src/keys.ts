export function metaKey(matchId: string): Deno.KvKey {
  return ['match', matchId, 'meta'];
}

export function leaderKey(matchId: string): Deno.KvKey {
  return ['match', matchId, 'leader'];
}

export function snapshotKey(matchId: string): Deno.KvKey {
  return ['match', matchId, 'snapshot'];
}

export function inputKey(matchId: string, slot: number): Deno.KvKey {
  return ['match', matchId, 'input', slot];
}

export function playerKey(matchId: string, slot: number): Deno.KvKey {
  return ['match', matchId, 'players', slot];
}

export function matchmakingOpenKey(): Deno.KvKey {
  return ['matchmaking', 'open'];
}

