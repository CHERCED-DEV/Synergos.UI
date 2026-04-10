/**
 * LiveReload via CDN polling for Synergos dev-cdn modes.
 *
 * Instead of a WebSocket server, this writes a `__dev.json` file to the CDN
 * on each sync. The client script (injected into the bundle) polls this file
 * and reloads when the timestamp changes.
 *
 * No extra servers — everything flows through the existing IIS static CDN
 * (synergos-static-local → C:\LOCAL_CDN).
 *
 * Usage (from any dev-cdn script):
 *   import { createDevSignal, LIVERELOAD_CLIENT_JS } from './lib/livereload.mjs';
 *   const signal = createDevSignal(cdnSynergosPath);
 *   // after sync:
 *   signal.touch();
 *   // cleanup:
 *   signal.clean();
 */

import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Create a dev signal file manager.
 * Writes `__dev.json` with a timestamp to the CDN root on each `touch()`.
 *
 * @param {string} cdnSynergosDir — e.g. C:\LOCAL_CDN\synergos
 * @returns {{ touch: () => void, clean: () => void }}
 */
export function createDevSignal(cdnSynergosDir) {
  const signalPath = join(cdnSynergosDir, '__dev.json');

  return {
    /** Write/update the signal file with current timestamp */
    touch() {
      mkdirSync(cdnSynergosDir, { recursive: true });
      writeFileSync(signalPath, JSON.stringify({
        ts: Date.now(),
        at: new Date().toISOString(),
      }));
    },

    /** Remove the signal file (on shutdown) */
    clean() {
      try { if (existsSync(signalPath)) unlinkSync(signalPath); } catch { /* ignore */ }
    },
  };
}

// ── Client-side polling snippet ──────────────────────────────────────────────

/**
 * Pure JS snippet injected into bundles during dev-cdn --livereload.
 *
 * Polls `__dev.json` from the CDN origin. Starts checking every 3s,
 * backs off to 10s after 20 consecutive unchanged polls (idle mode).
 * Any detected change resets to fast mode and reloads the page.
 * Only ONE poller runs per page (idempotent via global flag).
 */
export const LIVERELOAD_CLIENT_JS = `
;(function(){
  if(window.__synergosLR)return;window.__synergosLR=1;
  var scripts=document.querySelectorAll('script[src*="/synergos/"]');
  var base='';
  for(var i=0;i<scripts.length;i++){
    var m=scripts[i].src.match(/(.*\\/synergos)\\//)
    if(m){base=m[1];break}
  }
  if(!base)return;
  var url=base+'/__dev.json';
  var lastTs=0;
  var idle=0;
  var FAST=3000;
  var SLOW=10000;
  var IDLE_AFTER=20;
  function poll(){
    var interval=idle>=IDLE_AFTER?SLOW:FAST;
    fetch(url,{cache:'no-store'}).then(function(r){return r.json()}).then(function(d){
      if(lastTs&&d.ts!==lastTs){location.reload();return}
      lastTs=d.ts;
      idle++;
    }).catch(function(){idle++});
    setTimeout(poll,interval);
  }
  setTimeout(poll,FAST);
})();
`;
