export function clampInt(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function normalizeMoveDir(moveDir: number): number {
  if (!Number.isFinite(moveDir)) return 0;
  const n = Math.trunc(moveDir);
  if (n < 0 || n > 8) return 0;
  return n;
}

export function normalizeAimDir(aimDir: number): number {
  if (!Number.isFinite(aimDir)) return 0;
  const n = Math.trunc(aimDir);
  if (n < 0 || n > 15) return 0;
  return n;
}

export function moveVector(moveDir: number): { dx: number; dy: number } {
  switch (moveDir) {
    case 1:
      return { dx: 0, dy: -4 };
    case 2:
      return { dx: 3, dy: -3 };
    case 3:
      return { dx: 4, dy: 0 };
    case 4:
      return { dx: 3, dy: 3 };
    case 5:
      return { dx: 0, dy: 4 };
    case 6:
      return { dx: -3, dy: 3 };
    case 7:
      return { dx: -4, dy: 0 };
    case 8:
      return { dx: -3, dy: -3 };
    default:
      return { dx: 0, dy: 0 };
  }
}

export function aimVector(aimDir: number): { dx: number; dy: number } {
  const angle = (Math.PI * 2 * aimDir) / 16;
  return { dx: Math.cos(angle), dy: Math.sin(angle) };
}

