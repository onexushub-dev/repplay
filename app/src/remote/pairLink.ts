import { t } from '../i18n';

export type PairLink = { hostId: string; secret: string; hostName: string };

// 16 random bytes as base64url without padding are exactly 22 characters.
const SECRET = /^[A-Za-z0-9_-]{22}$/;
const CODE = /^[0-9]{6}$/;

/**
 * Reads the parameters of `reprize://pair?h=...&s=...&n=...`, the link the camera phone shows as a QR code.
 * Null when the host id or the secret is missing or malformed; a missing name only falls back to a generic one.
 */
export function parsePairLink(params: { h?: string; s?: string; n?: string }): PairLink | null {
  const hostId = params.h;
  const secret = params.s;
  const name = params.n;
  if (typeof hostId !== 'string' || hostId.length === 0 || hostId.length > 64) return null;
  if (typeof secret !== 'string' || !SECRET.test(secret)) return null;
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return { hostId, secret, hostName: trimmed.length > 0 ? trimmed.slice(0, 40) : t('remote.genericHost') };
}

/** The six digits typed by hand (spaces allowed), or null when it is not a code. */
export function parseCode(input: string): string | null {
  const digits = input.replace(/\s+/g, '');
  return CODE.test(digits) ? digits : null;
}

/** The text read from the QR code (`reprize://pair?h=...&s=...&n=...`), or null when it is anything else. */
export function parsePairUrl(text: string): PairLink | null {
  const match = /^reprize:\/\/pair\?(.*)$/.exec(text.trim());
  if (match === null) return null;
  const params: { h?: string; s?: string; n?: string } = {};
  for (const pair of match[1].split('&')) {
    const at = pair.indexOf('=');
    if (at < 0) continue;
    let value = pair.slice(at + 1);
    try {
      value = decodeURIComponent(value.replace(/\+/g, ' '));
    } catch {
      return null;
    }
    const key = pair.slice(0, at);
    if (key === 'h' || key === 's' || key === 'n') params[key] = value;
  }
  return parsePairLink(params);
}
