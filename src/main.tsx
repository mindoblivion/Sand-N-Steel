import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Phase 4 — development-only character test harness. Reachable ONLY in a Vite
// dev build (import.meta.env.DEV) when the EXACT `?devHarness=character` query
// parameter is present. In that mode the normal <App /> is not mounted at all,
// so the title screen, save loader and city hub never run. In production
// (import.meta.env.DEV is `false`) the branch is statically eliminated, so the
// harness cannot be activated even by supplying the parameter.
const useCharacterHarness =
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get('devHarness') === 'character';

if (useCharacterHarness) {
  // Lazy so the harness module (and its DuelScene chunk) is never even parsed
  // outside this dev+param path.
  void import('./components/dev/CharacterTestHarness').then(({ CharacterTestHarness }) => {
    ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
      <React.StrictMode>
        <CharacterTestHarness />
      </React.StrictMode>,
    );
  });
} else {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
