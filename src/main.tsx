import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/fonts.css';
import './styles/tokens.css';
import './styles/global.css';
import './styles/overlays.css';

import { App } from './app/App';
import { bootSync } from './app/boot';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

// The URL is parsed into the store before the first render, so no dropdown is
// ever flashed empty and then filled (03 §7).
bootSync();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
