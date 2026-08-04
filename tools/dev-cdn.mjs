#!/usr/bin/env node
/**
 * dev-cdn — SUSPENDIDO por la purga de Nx (2026-08-04).
 *
 * Este flujo lanzaba `nx build --watch` por elemento y servía el CDN local con
 * livereload. La mitad de Nx murió con la purga; la mitad del servidor sigue
 * siendo la idea correcta (es la razón por la que este repo existe: ver un
 * cambio en el CMS sin esperar un release).
 *
 * El arquitecto difirió el rework a propósito: «cuando nos toque, nos las
 * apañaremos creando servidores y pegándoselos a la CDN». Mientras tanto, el
 * ciclo rápido es:
 *
 *   npm run dev                  # build --watch incremental (platforms/angular)
 *   npm run build:cdn            # arma public/ entero en ~1 min
 *   npx wrangler dev             # sirve public/ localmente
 *
 * El código anterior queda en git (este mismo fichero, revisión previa) para
 * cuando se recablee sobre tools/build.mjs --watch.
 */
console.error('[dev-cdn] Suspendido tras la purga de Nx — ver la cabecera de este fichero para el ciclo rápido actual.');
process.exit(1);
