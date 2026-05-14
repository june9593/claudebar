// ApiClient — single typed gateway from renderer to backend. Today the only
// implementation wraps window.electronAPI (Electron IPC). In Phase B a second
// implementation will speak WebSocket to a local main-process server, enabling
// the same React bundle to run inside a browser/PWA.
//
// Spec: docs/specs/2026-05-13-multi-device-design.md §15
//
// Migration rule: NO new file under src/ may call window.electronAPI directly.
// Every IPC interaction goes through `apiClient`.

import type { ElectronAPI } from '../../types/electron';

export type ApiClient = ElectronAPI;

function createElectronApiClient(): ApiClient {
  const w = window as unknown as { electronAPI?: ElectronAPI };
  if (!w.electronAPI) {
    throw new Error(
      'createElectronApiClient called but window.electronAPI is missing — ' +
      'preload script may have failed to load.'
    );
  }
  return w.electronAPI;
}

function createBrowserApiClient(): ApiClient {
  // Phase B will implement this — a WebSocket-based transport to a local
  // ClaudeBar main process. For now, throw on any usage so it's obvious
  // when something tries to run the renderer outside Electron.
  const reject = () => {
    throw new Error(
      'apiClient: browser transport not yet implemented (Phase B). ' +
      'Run inside the Electron shell.'
    );
  };
  return new Proxy({}, {
    get() { return reject; },
  }) as ApiClient;
}

function pickImpl(): ApiClient {
  if (typeof window === 'undefined') return createBrowserApiClient();
  const w = window as unknown as { electronAPI?: ElectronAPI };
  return w.electronAPI ? createElectronApiClient() : createBrowserApiClient();
}

export const apiClient: ApiClient = pickImpl();
