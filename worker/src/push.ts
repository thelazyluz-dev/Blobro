// Web Push sender — encrypts a JSON payload (RFC 8291, aes128gcm content
// encoding per RFC 8188) and authorizes it with VAPID (RFC 8292), using only
// WebCrypto, no dependencies, so it runs in the Worker.
//
// Delivery itself can only be verified against a real push service on a real
// device — there is no way to exercise the end-to-end path in CI. The pieces
// that CAN be checked (base64url round-trips, the request shape, that the whole
// pipeline runs without throwing) are unit-tested; the encryption's correctness
// is trusted to the RFCs. Every failure path is swallowed by the caller, so a
// broken send never breaks a save/submit — it just doesn't deliver.

export interface PushSub {
  endpoint: string;
  p256dh: string; // client public key (base64url, 65-byte uncompressed point)
  auth: string; // client auth secret (base64url, 16 bytes)
}
export interface VapidConfig {
  publicKey: string; // base64url uncompressed point
  privateKey: string; // base64url 32-byte scalar (the `d` value)
  subject: string; // mailto: or https: contact
}
export interface PushMessage {
  title: string;
  body: string;
  tag?: string; // same tag replaces a prior notification of the same kind
  url?: string; // where a tap should land
  // Delivery hints for the push service (RFC 8030). Time-sensitive alerts
  // ("someone overtook you") set urgency 'high' and a short TTL so a push the
  // service couldn't deliver promptly is DROPPED rather than shown hours later
  // as stale news. Ambient nudges (offline cap) keep the long default.
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
  ttlSeconds?: number;
}
export type PushResult = 'ok' | 'gone' | 'error' | 'unconfigured';

const enc = new TextEncoder();

// @cloudflare/workers-types diverges from the WebCrypto spec in a few spots
// (it calls ECDH's key `$public`, narrows importKey's overloads, and types
// generateKey as a union). The runtime is standard WebCrypto, so we call it
// through a loosely-typed handle and keep the standard spec property names.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const subtle: any = crypto.subtle;

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function bytesToB64url(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

/** Build the `Authorization: vapid t=…, k=…` header for a given endpoint origin. */
export async function vapidAuthHeader(vapid: VapidConfig, audience: string): Promise<string> {
  const pub = b64urlToBytes(vapid.publicKey); // 0x04 || X(32) || Y(32)
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    d: vapid.privateKey,
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    ext: true,
  };
  const key = await subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = bytesToB64url(
    enc.encode(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: vapid.subject })),
  );
  const signingInput = `${header}.${claims}`;
  const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(signingInput));
  const jwt = `${signingInput}.${bytesToB64url(sig)}`;
  return `vapid t=${jwt}, k=${vapid.publicKey}`;
}

/** Encrypt a payload for a subscription → the aes128gcm request body. */
export async function encryptPayload(sub: PushSub, plaintext: Uint8Array): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(sub.p256dh); // 65 bytes
  const authSecret = b64urlToBytes(sub.auth); // 16 bytes

  const ephemeral = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await subtle.exportKey('raw', ephemeral.publicKey)); // 65 bytes
  const uaKey = await subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(
    await subtle.deriveBits({ name: 'ECDH', public: uaKey }, ephemeral.privateKey, 256),
  );

  // RFC 8291: derive the input keying material from the ECDH secret + auth.
  const ikmInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdh, ikmInfo, 32);

  // RFC 8188 aes128gcm: a random salt seeds the content key + nonce.
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const aesKey = await subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // Single (last) record: plaintext followed by the 0x02 delimiter, no padding.
  const record = concat(plaintext, new Uint8Array([0x02]));
  const ciphertext = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, record),
  );

  // aes128gcm header: salt(16) | rs(4, BE) | idlen(1) | keyid(=as_public, 65).
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  const header = concat(salt, rs, new Uint8Array([asPublic.length]), asPublic);
  return concat(header, ciphertext);
}

/** Send one push. Returns 'gone' for a dead subscription (caller should prune). */
export async function sendPush(vapid: VapidConfig, sub: PushSub, message: PushMessage): Promise<PushResult> {
  if (!vapid.publicKey || !vapid.privateKey || !vapid.subject) return 'unconfigured';
  try {
    const audience = new URL(sub.endpoint).origin;
    // The transport hints ride in HTTP headers, not the encrypted payload the
    // service worker reads — strip them before serializing.
    const { urgency, ttlSeconds, ...payload } = message;
    const [authorization, body] = await Promise.all([
      vapidAuthHeader(vapid, audience),
      encryptPayload(sub, enc.encode(JSON.stringify(payload))),
    ]);
    const ttl = Number.isFinite(ttlSeconds) ? Math.max(0, Math.floor(ttlSeconds!)) : 86400;
    const headers: Record<string, string> = {
      Authorization: authorization,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
    };
    if (urgency) headers.Urgency = urgency; // RFC 8030 §5.3 — hints delivery priority
    const res = await fetch(sub.endpoint, { method: 'POST', headers, body });
    if (res.status === 201 || res.status === 200) return 'ok';
    if (res.status === 404 || res.status === 410) return 'gone'; // subscription expired/unsubscribed
    return 'error';
  } catch {
    return 'error';
  }
}
