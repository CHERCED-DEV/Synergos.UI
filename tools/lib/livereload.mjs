/**
 * LiveReload WebSocket server for Synergos dev-cdn modes.
 *
 * Opens a tiny WebSocket server on a configurable port.
 * When `notify()` is called (e.g. after syncing a bundle to CDN),
 * every connected browser client receives a "reload" message.
 *
 * Usage (from any dev-cdn script):
 *   import { startLiveReload, LIVERELOAD_SNIPPET } from './lib/livereload.mjs';
 *   const lr = startLiveReload();       // port 35729 by default
 *   // after sync:
 *   lr.notify();
 *   // on shutdown:
 *   lr.close();
 *
 * In the CMS page, inject `LIVERELOAD_SNIPPET` during local development
 * so the browser auto-refreshes when CDN files are updated.
 */

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

const DEFAULT_PORT = 35729;

/**
 * Start the LiveReload WebSocket server.
 *
 * Uses raw HTTP upgrade + minimal WebSocket framing to avoid
 * any npm dependency (ws, socket.io, etc.).
 *
 * @param {{ port?: number }} [options]
 * @returns {{ notify: () => void, close: () => void }}
 */
export function startLiveReload(options = {}) {
  const port = options.port || DEFAULT_PORT;
  /** @type {Set<import('node:net').Socket>} */
  const clients = new Set();

  const server = createServer((_req, res) => {
    // Health check endpoint for tooling
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('livereload ok');
  });

  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }

    // WebSocket handshake (RFC 6455)
    const accept = createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-5AB5DC11E5A3')
      .digest('base64');

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      '\r\n',
    );

    clients.add(socket);
    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));
  });

  server.listen(port, () => {
    console.log(`  🔄 LiveReload server → ws://localhost:${port}`);
  });

  /**
   * Send a WebSocket text frame to every connected client.
   * @param {string} message
   */
  function broadcast(message) {
    const payload = Buffer.from(message, 'utf-8');
    const frame = buildTextFrame(payload);

    for (const socket of clients) {
      try { socket.write(frame); } catch { clients.delete(socket); }
    }
  }

  return {
    /** Notify all clients to reload */
    notify() { broadcast('reload'); },

    /** Shut down the server and close all connections */
    close() {
      for (const socket of clients) {
        try { socket.destroy(); } catch { /* ignore */ }
      }
      clients.clear();
      server.close();
    },
  };
}

/**
 * Build a WebSocket text frame (opcode 0x1, FIN bit set).
 * Supports payload up to 65 535 bytes (enough for short messages).
 * @param {Buffer} payload
 * @returns {Buffer}
 */
function buildTextFrame(payload) {
  const len = payload.length;
  let header;

  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text opcode
    header[1] = len;
  } else {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  }

  return Buffer.concat([header, payload]);
}

// ── Client-side snippet ──────────────────────────────────────────────────────

/**
 * Inline `<script>` to inject in the CMS page during local dev.
 * Connects to the LiveReload WS and reloads the page on "reload" message.
 * Includes reconnect logic (1 s backoff).
 */
export const LIVERELOAD_SNIPPET = `<script data-synergos-livereload>
(function () {
  var port = ${DEFAULT_PORT};
  function connect() {
    var ws = new WebSocket('ws://localhost:' + port);
    ws.onmessage = function (e) { if (e.data === 'reload') location.reload(); };
    ws.onclose = function () { setTimeout(connect, 1000); };
  }
  connect();
})();
</script>`;
