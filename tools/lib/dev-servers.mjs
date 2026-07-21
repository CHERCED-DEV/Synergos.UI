/**
 * Dev-server registry for Synergos CMS hot-reload.
 *
 * Manages `__dev-servers.json` in the CDN directory.  UI dev tools call
 * `registerDevServer()` on startup and `unregisterDevServer()` on exit.
 * The CMS watches this file via FileSystemWatcher and swaps element URL
 * overrides in real-time — no CMS restart required.
 *
 * File format:
 *   {
 *     "servers": {
 *       "hero": { "url": "http://localhost:4202", "framework": "angular", "pid": 1234, "startedAt": "..." },
 *       "card": { "url": "http://localhost:4203", "framework": "react",   "pid": 1235, "startedAt": "..." }
 *     }
 *   }
 *
 * The CMS only reads `url`. Other fields are informational for debugging.
 *
 * Usage:
 *   import { registerDevServer, unregisterDevServer } from './lib/dev-servers.mjs';
 *   registerDevServer(CDN_SYNERGOS, 'hero', 'http://localhost:4202', 'angular');
 *   // on cleanup:
 *   unregisterDevServer(CDN_SYNERGOS, 'hero');
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync, watch as fsWatch } from 'node:fs';
import { join } from 'node:path';

const FILE_NAME = '__dev-servers.json';
const STOP_FILE = '__dev-stop';

/**
 * Read the current dev-servers file.
 * @param {string} cdnSynergosDir — e.g. C:\LOCAL_CDN\synergos
 * @returns {Record<string, { url: string, framework?: string, pid?: number, startedAt?: string }>}
 */
export function readDevServers(cdnSynergosDir) {
  const filePath = join(cdnSynergosDir, FILE_NAME);
  try {
    if (!existsSync(filePath)) return {};
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    return data?.servers ?? {};
  } catch {
    return {};
  }
}

/**
 * Register a dev server for an element (incremental merge).
 * Reads the existing file, adds/updates the entry, writes back.
 *
 * @param {string} cdnSynergosDir — e.g. C:\LOCAL_CDN\synergos
 * @param {string} elementName    — e.g. "hero"
 * @param {string} url            — e.g. "http://localhost:4202"
 * @param {string} [framework]    — e.g. "angular" (informational)
 */
export function registerDevServer(cdnSynergosDir, elementName, url, framework) {
  mkdirSync(cdnSynergosDir, { recursive: true });
  const filePath = join(cdnSynergosDir, FILE_NAME);

  const servers = readDevServers(cdnSynergosDir);
  servers[elementName] = {
    url,
    framework: framework || undefined,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };

  writeFileSync(filePath, JSON.stringify({ servers }, null, 2));
}

/**
 * Unregister a dev server for an element (incremental removal).
 * If no servers remain, the file is deleted entirely.
 *
 * @param {string} cdnSynergosDir — e.g. C:\LOCAL_CDN\synergos
 * @param {string} elementName    — e.g. "hero"
 */
export function unregisterDevServer(cdnSynergosDir, elementName) {
  const filePath = join(cdnSynergosDir, FILE_NAME);
  if (!existsSync(filePath)) return;

  const servers = readDevServers(cdnSynergosDir);
  delete servers[elementName];

  if (Object.keys(servers).length === 0) {
    try { unlinkSync(filePath); } catch { /* ignore */ }
  } else {
    writeFileSync(filePath, JSON.stringify({ servers }, null, 2));
  }
}

/**
 * Unregister multiple elements at once (convenience for cleanup handlers).
 *
 * @param {string} cdnSynergosDir
 * @param {string[]} elementNames
 */
export function unregisterAll(cdnSynergosDir, elementNames) {
  for (const name of elementNames) {
    unregisterDevServer(cdnSynergosDir, name);
  }
}

// ── Stop signal ─────────────────────────────────────────────────────────────

/**
 * Request all dev-cdn processes to stop gracefully.
 * Creates `__dev-stop` signal file in the CDN directory.
 * Running dev-cdn processes watch for this file and trigger cleanup().
 *
 * @param {string} cdnSynergosDir
 */
export function requestStop(cdnSynergosDir) {
  mkdirSync(cdnSynergosDir, { recursive: true });
  writeFileSync(join(cdnSynergosDir, STOP_FILE), new Date().toISOString());
}

/**
 * Clear the stop signal (called after cleanup is done).
 * @param {string} cdnSynergosDir
 */
export function clearStopSignal(cdnSynergosDir) {
  const p = join(cdnSynergosDir, STOP_FILE);
  try { if (existsSync(p)) unlinkSync(p); } catch { /* ignore */ }
}

/**
 * Watch for the `__dev-stop` signal file. When it appears, call onStop().
 * Returns a close() function to stop watching.
 *
 * @param {string} cdnSynergosDir
 * @param {() => void} onStop — callback invoked when stop signal is detected
 * @returns {{ close: () => void }}
 */
export function watchStopSignal(cdnSynergosDir, onStop) {
  mkdirSync(cdnSynergosDir, { recursive: true });

  const watcher = fsWatch(cdnSynergosDir, (eventType, filename) => {
    if (filename === STOP_FILE && existsSync(join(cdnSynergosDir, STOP_FILE))) {
      onStop();
    }
  });

  // Also check if it already exists (race condition: stop requested before watcher started)
  if (existsSync(join(cdnSynergosDir, STOP_FILE))) {
    setTimeout(onStop, 100);
  }

  return { close: () => watcher.close() };
}
