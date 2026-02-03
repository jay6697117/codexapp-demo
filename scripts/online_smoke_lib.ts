export type ClientInput = {
  seq: number;
  moveDir: number;
  aimDir: number;
  fire: boolean;
};

export function readSnapshotSeq(bytes: ArrayBuffer | Uint8Array): number {
  const view =
    bytes instanceof Uint8Array ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) : new DataView(bytes);
  if (view.byteLength < 5) return 0;
  // Snapshot layout: version(u8) + snapshotSeq(u32 LE) + ...
  return view.getUint32(1, true);
}

export function buildWsUrl(baseUrl: string, matchId: string, playerId: string, token: string): string {
  const url = new URL('/ws', baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('matchId', matchId);
  url.searchParams.set('playerId', playerId);
  url.searchParams.set('token', token);
  return url.toString();
}

export function nextInput(step: number): ClientInput {
  const dirs = [1, 3, 5, 7];
  const moveDir = dirs[step % dirs.length];
  const aimDir = (step * 3) % 16;
  const fire = step % 2 === 0;
  return { seq: step + 1, moveDir, aimDir, fire };
}
