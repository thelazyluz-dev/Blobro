import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/suez-one/400.css';
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/700.css';
import './index.css';
import { App } from './App';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element missing');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
