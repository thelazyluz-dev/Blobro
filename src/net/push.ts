// Web Push client — permission, subscribe/unsubscribe, and a local on/off
// preference. Every function is a safe no-op when push isn't configured
// (no VAPID key) or unsupported (no SW / PushManager / Notification), so the
// rest of the app never has to guard.
//
// The reward the SW shows is sent by the Worker (see /push send). Here we only
// register the device's subscription so the server has somewhere to push to.

import { AUTH_API, VAPID_PUBLIC_KEY } from '../config';

const BASE = () => AUTH_API.replace(/\/$/, '');
const PREF_KEY = 'blorbo.notificationsOn';

/** True when push is configured AND the browser supports it. */
export function pushSupported(): boolean {
  return (
    AUTH_API.trim().length > 0 &&
    VAPID_PUBLIC_KEY.trim().length > 0 &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** The player's stored preference (they turned notifications on). */
export function notificationsPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === '1';
  } catch {
    return false;
  }
}
function setPref(on: boolean): void {
  try {
    if (on) localStorage.setItem(PREF_KEY, '1');
    else localStorage.removeItem(PREF_KEY);
  } catch {
    /* ignore */
  }
}

/** The browser's current Notification permission ('default' | 'granted' | 'denied'). */
export function notificationPermission(): NotificationPermission {
  return typeof Notification !== 'undefined' ? Notification.permission : 'denied';
}

// VAPID public key (base64url) → the Uint8Array applicationServerKey wants.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function subJSON(sub: PushSubscription): { endpoint: string; keys: { p256dh: string; auth: string } } | null {
  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) return null;
  return { endpoint: json.endpoint, keys: { p256dh, auth } };
}

async function post(path: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(`${BASE()}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Turn notifications ON: ask permission, subscribe via the SW, register the
 * subscription server-side. Returns the resulting state so the UI can reflect
 * it: 'on' | 'denied' (the browser refused) | 'unsupported' | 'error'.
 */
export async function enablePush(): Promise<'on' | 'denied' | 'unsupported' | 'error'> {
  if (!pushSupported()) return 'unsupported';
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true, // required; we only ever send visible notifications
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const payload = subJSON(sub);
    if (!payload) return 'error';
    const ok = await post('/push/subscribe', payload);
    if (!ok) return 'error';
    setPref(true);
    return 'on';
  } catch {
    return 'error';
  }
}

/** Turn notifications OFF: drop the browser subscription and the server row. */
export async function disablePush(): Promise<void> {
  setPref(false);
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const payload = subJSON(sub);
      await sub.unsubscribe();
      if (payload) await post('/push/unsubscribe', { endpoint: payload.endpoint });
    }
  } catch {
    /* best-effort — the pref is already off, and a stale server row prunes on 404/410 */
  }
}

/**
 * On load, if the player previously turned notifications on and permission is
 * still granted, make sure the current subscription is registered (endpoints
 * can rotate). Silent — never prompts. Safe no-op otherwise.
 */
export async function refreshPushSubscription(): Promise<void> {
  if (!pushSupported() || !notificationsPref() || notificationPermission() !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const payload = subJSON(sub);
    if (payload) await post('/push/subscribe', payload);
  } catch {
    /* ignore — a failed refresh just means the next enable() fixes it */
  }
}
