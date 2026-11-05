import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { revisarPublicacionPorRelease, disparosDe, pasosDe } from './cdn-sale-con-un-release.mjs';
import { ROOT } from './synergos-config.mjs';

/**
 * Que la CDN de producción se publique sólo con un release (R-2 del CMS, D-002-P12, 2026-11-04).
 *
 * Hasta hoy `despliegue-cdn.yml` corría `wrangler deploy` en cada push a master. Se mira el workflow de verdad y,
 * con dobles, cada forma de volver a publicar sin release.
 */

const BUENO = [
  'on:',
  '  push:',
  '    branches:',
  '      - master',
  "    tags: ['release-*']",
  '  workflow_dispatch:',
  '    inputs:',
  '      release:',
  "        description: 'Etiqueta del release'",
  'jobs:',
  '  desplegar:',
  '    steps:',
  '      - id: release',
  '        env:',
  "          RELEASE: ${{ github.event.inputs.release || (github.ref_type == 'tag' && github.ref_name) || '' }}",
  '        run: |',
  '          case "$RELEASE" in',
  '            release-*) ;;',
  '          esac',
  '      - name: Es un release, y su commit está en master',
  '        run: git merge-base --is-ancestor "$SHA" FETCH_HEAD',
  '      - name: Construir el CDN',
  '        run: npm run build:cdn',
  "      - if: steps.release.outputs.publicar == 'si' && steps.config.outputs.listo == 'si'",
  '        name: wrangler deploy',
  '        run: npx wrangler deploy',
].join('\n');

describe('la CDN sale con un release (R-2, D-002-P12)', () => {
  it('el despliegue-cdn.yml de verdad: sólo un release publica', () => {
    const yaml = readFileSync(join(ROOT, '.github', 'workflows', 'despliegue-cdn.yml'), 'utf8');
    expect(revisarPublicacionPorRelease(yaml)).toEqual([]);
  });

  it('el doble bueno pasa, y el gate ve sus pasos y sus disparos', () => {
    expect(revisarPublicacionPorRelease(BUENO)).toEqual([]);
    expect(pasosDe(BUENO)).toHaveLength(4);
    expect(disparosDe(BUENO)).toContain("tags: ['release-*']");
  });

  it('publicar en cada push a master, como antes, es rojo', () => {
    const antes = BUENO.replace("    tags: ['release-*']\n", '').replace(
      "      - if: steps.release.outputs.publicar == 'si' && steps.config.outputs.listo == 'si'",
      "      - if: steps.config.outputs.listo == 'si'",
    );
    const motivos = revisarPublicacionPorRelease(antes);
    expect(motivos.some((m) => m.includes('release-*'))).toBe(true);
    expect(motivos.some((m) => m.includes('publica sin la condición'))).toBe(true);
  });

  it('un paso que publica sin la condición del release es rojo, aunque la etiqueta dispare', () => {
    const sinCondicion = BUENO.replace(
      "      - if: steps.release.outputs.publicar == 'si' && steps.config.outputs.listo == 'si'\n        name: wrangler deploy",
      '      - name: wrangler deploy',
    );
    expect(revisarPublicacionPorRelease(sinCondicion)).toEqual([
      "el paso «wrangler deploy» publica sin la condición steps.release.outputs.publicar == 'si'",
    ]);
  });

  it('el disparo manual con un SHA es rojo: publicaría cualquier commit', () => {
    const conSha = BUENO.replace('      release:', '      sha:');
    const motivos = revisarPublicacionPorRelease(conSha);
    expect(motivos).toContain('el disparo manual acepta un SHA: publicaría cualquier commit, no un release');
  });

  it('publicar al terminar otro workflow o por calendario es rojo', () => {
    for (const disparo of ['  workflow_run:\n    workflows: [Imágenes]', "  schedule:\n    - cron: '0 * * * *'"]) {
      const yaml = BUENO.replace('  workflow_dispatch:', `${disparo}\n  workflow_dispatch:`);
      expect(revisarPublicacionPorRelease(yaml).some((m) => m.startsWith('se dispara con'))).toBe(true);
    }
  });

  it('un release que no se comprueba en master es rojo', () => {
    const sinMaster = BUENO.replace('git merge-base --is-ancestor "$SHA" FETCH_HEAD', 'echo ok');
    expect(revisarPublicacionPorRelease(sinMaster)).toEqual(['no se comprueba que el commit del release esté en master']);
  });

  it('lo que dice un comentario no cuenta como código', () => {
    const comentado = BUENO.replace('        run: npx wrangler deploy', '        run: npx wrangler deploy\n      # - run: npx wrangler deploy');
    expect(revisarPublicacionPorRelease(comentado)).toEqual([]);
  });
});
