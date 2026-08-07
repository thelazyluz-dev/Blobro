// Unit tests for the Web Push sender's building blocks. Delivery can't be
// exercised in CI, but the crypto PIPELINE (VAPID JWT, aes128gcm body) and the
// request shape can — these run in workerd, where WebCrypto + fetch exist.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encryptPayload, sendPush, vapidAuthHeader, type PushSub, type VapidConfig } from '../src/push';

const enc = new TextEncoder();
function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function bytesToB64url(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// A real VAPID keypair (ECDSA P-256) in the base64url forms the sender expects.
async function makeVapid(): Promise<VapidConfig> {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return { publicKey: bytesToB64url(pub), privateKey: jwk.d as string, subject: 'mailto:test@example.com' };
}

// A plausible client subscription (a real ECDH public key + a 16-byte auth).
async function makeSub(endpoint: string): Promise<PushSub> {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { endpoint, p256dh: bytesToB64url(pub), auth: bytesToB64url(auth) };
}

afterEach(() => vi.unstubAllGlobals());

describe('vapidAuthHeader', () => {
  it('produces a vapid Authorization with a well-formed ES256 JWT', async () => {
    const vapid = await makeVapid();
    const header = await vapidAuthHeader(vapid, 'https://push.example');
    expect(header.startsWith('vapid t=')).toBe(true);
    expect(header).toContain(`, k=${vapid.publicKey}`);
    const jwt = header.slice('vapid t='.length, header.indexOf(', k='));
    const parts = jwt.split('.');
    expect(parts).toHaveLength(3);
    const head = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
    expect(head.alg).toBe('ES256');
    expect(claims.aud).toBe('https://push.example');
    expect(claims.sub).toBe('mailto:test@example.com');
    expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(b64urlToBytes(parts[2]).length).toBe(64); // raw r||s ECDSA signature
  });
});

describe('encryptPayload', () => {
  it('lays out the aes128gcm header (salt | rs | idlen=65 | as_public) + ciphertext', async () => {
    const sub = await makeSub('https://push.example/x');
    const body = await encryptPayload(sub, enc.encode('{"hello":"world"}'));
    // 16 salt + 4 rs + 1 idlen + 65 key = 86-byte header, then a non-empty body.
    expect(body.length).toBeGreaterThan(86 + 16);
    const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0);
    expect(rs).toBe(4096);
    expect(body[20]).toBe(65); // idlen
    expect(body[21]).toBe(0x04); // uncompressed EC point prefix of as_public
  });
});

describe('sendPush', () => {
  it('POSTs the encrypted body with the right headers and maps status → result', async () => {
    const vapid = await makeVapid();
    const sub = await makeSub('https://push.example/aaa');
    let captured: { url: string; init: RequestInit } | null = null;
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      captured = { url, init };
      return new Response(null, { status: 201 });
    });
    const r = await sendPush(vapid, sub, { title: 'hi', body: 'there' });
    expect(r).toBe('ok');
    expect(captured!.url).toBe('https://push.example/aaa');
    expect(captured!.init.method).toBe('POST');
    const h = new Headers(captured!.init.headers);
    expect(h.get('Content-Encoding')).toBe('aes128gcm');
    expect(h.get('Authorization')!.startsWith('vapid t=')).toBe(true);
    expect(captured!.init.body).toBeInstanceOf(Uint8Array);
  });

  it('defaults to a 24h TTL and no Urgency when no hints are given', async () => {
    const vapid = await makeVapid();
    const sub = await makeSub('https://push.example/def');
    let captured: RequestInit | null = null;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      captured = init;
      return new Response(null, { status: 201 });
    });
    await sendPush(vapid, sub, { title: 'x', body: 'y' });
    const h = new Headers(captured!.headers);
    expect(h.get('TTL')).toBe('86400');
    expect(h.get('Urgency')).toBeNull();
  });

  it('honors urgency + a short ttl for time-sensitive alerts, without leaking them into the payload', async () => {
    const vapid = await makeVapid();
    const sub = await makeSub('https://push.example/hint');
    let captured: RequestInit | null = null;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      captured = init;
      return new Response(null, { status: 201 });
    });
    await sendPush(vapid, sub, { title: 'x', body: 'y', urgency: 'high', ttlSeconds: 900 });
    const h = new Headers(captured!.headers);
    expect(h.get('Urgency')).toBe('high');
    expect(h.get('TTL')).toBe('900');
    // The hints travel as HTTP headers; the encrypted body stays bytes (the SW
    // only ever decrypts title/body/tag/url).
    expect(captured!.body).toBeInstanceOf(Uint8Array);
  });

  it('reports a 410 as "gone" (so the caller prunes it)', async () => {
    const vapid = await makeVapid();
    const sub = await makeSub('https://push.example/dead');
    vi.stubGlobal('fetch', async () => new Response(null, { status: 410 }));
    expect(await sendPush(vapid, sub, { title: 'x', body: 'y' })).toBe('gone');
  });

  it('no-ops (unconfigured) with no VAPID keys', async () => {
    const sub = await makeSub('https://push.example/z');
    expect(await sendPush({ publicKey: '', privateKey: '', subject: '' }, sub, { title: 'x', body: 'y' })).toBe(
      'unconfigured',
    );
  });
});
