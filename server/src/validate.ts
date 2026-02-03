import { MAX_PLAYERS } from '../../shared/mod.ts';
import { MAX_NICKNAME_LENGTH } from './config.ts';

export function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid ${name}`);
  return value;
}

export function parseNickname(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const maybe = (body as { nickname?: unknown }).nickname;
  if (typeof maybe !== 'string') return '';
  const n = maybe.trim();
  if (n.length === 0) return '';
  return n.slice(0, MAX_NICKNAME_LENGTH);
}

export function parseSlotFromPlayerId(playerId: string): number {
  const m = /^p(\d)_/.exec(playerId);
  if (!m) throw new Error('Invalid playerId');
  const slot = Number(m[1]);
  if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_PLAYERS) {
    throw new Error('Invalid playerId');
  }
  return slot;
}

