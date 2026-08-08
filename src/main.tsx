import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/suez-one/400.css';
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/700.css';
import './index.css';
import { App } from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { capturePendingGroup } from './net/groups';
import { capturePendingRef } from './net/referral';

// Capture an incoming ?ref=CODE invite BEFORE anything else (and before the
// Google sign-in redirect, which drops query params) — it's stashed in
// localStorage and claimed once a session exists (see store.syncReferral).
// A group invite (?group=CODE) rides the same link and gets the same dance.
capturePendingRef();
capturePendingGroup();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element missing');

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// Register the offline service worker in production. Skipped inside an iframe
// (e.g. the artifact preview) where SW registration isn't meaningful.
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.top === window.self) {
  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker.register(swUrl).catch(() => {
      /* offline support is best-effort */
    });
  });
}
