const encoder = new TextEncoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function sha256Base64Url(input: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(input)));
  return base64UrlEncode(hash);
}

export function randomToken(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

