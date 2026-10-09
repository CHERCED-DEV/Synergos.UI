import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { descubrirFuentes } from './element-sources.mjs';
import { raicesEnDisco } from './frameworks.mjs';
import {
  AJENAS_AL_REGISTRO,
  componentesQuePintan,
  etiquetasDeLasFuentes,
  revisarDependencias,
  sinComentariosDeCodigo,
} from './etiquetas-crudas.mjs';

/**
 * Cada `<synergos-*>` que un elemento pinta CRUDO está en sus `dependencies` del registry (ADR
 * 0140 F4, CMS#201). La razón y lo medido están en la cabecera de `etiquetas-crudas.mjs`.
 */

const REPO = path.resolve(import.meta.dirname, '../..');
const REGISTRO = JSON.parse(readFileSync(path.join(REPO, 'vitals/contracts/src/element-registry.json'), 'utf8'));

/**
 * Los que todavía pintan una etiqueta cruda sin declararla, censados el 2026-10-09 al arreglar el
 * QR de Eventos. Son el mismo defecto —el elemento queda sin definir y se ve su hueco— pero
 * heredados y fuera de la compra de la F4, y cada uno cambia los `<script>` que el CMS emite en
 * la página de otro vertical: se declaran en su ticket, midiendo esa página. El censo sólo baja.
 */
const HEREDADOS_SIN_DECLARAR = [
  'academy → comments-widget',
  'academy → qr-code',
  'academy → video-player',
  'blogs → comments-widget',
  'blogs → notification-center',
  'gov → qr-code',
  'storefront → rating-stars',
  'travel-shell → qr-code',
  'travel-shell → seat-map',
];

const aBarras = (ruta) => ruta.split(path.sep).join('/');

function archivos(dir, base = dir, salida = []) {
  if (!existsSync(dir)) return salida;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!/^(node_modules|dist|\..*)$/.test(e.name)) archivos(full, base, salida);
    } else if (/\.(html|tsx?)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) {
      salida.push({ ruta: aBarras(path.relative(base, full)), abs: full, fuente: readFileSync(full, 'utf8') });
    }
  }
  return salida;
}

/** Los componentes de librería de TODAS las plataformas que pintan etiquetas crudas. */
const deLibrerias = componentesQuePintan(
  raicesEnDisco(REPO).flatMap((raiz) =>
    archivos(path.join(raiz, 'libs'))
      .filter((a) => /\.tsx?$/.test(a.ruta) && !/\.spec\./.test(a.ruta))
      .map((a) => {
        const url = /templateUrl:\s*['"]([^'"]+)['"]/.exec(a.fuente)?.[1];
        const plantilla = url ? path.resolve(path.dirname(a.abs), url) : '';
        return { ruta: a.ruta, fuente: a.fuente, plantilla: plantilla && existsSync(plantilla) ? readFileSync(plantilla, 'utf8') : '' };
      }),
  ),
);

/** Por elemento, lo que pinta crudo: lo de sus fuentes y lo de las clases de librería que usa. */
const pinta = new Map(
  [
    ...descubrirFuentes({
      listar: (d) => {
        const abs = path.resolve(REPO, d);
        return existsSync(abs) && statSync(abs).isDirectory()
          ? readdirSync(abs, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
          : [];
      },
      existe: (r) => existsSync(path.resolve(REPO, r)),
    }),
  ].map(([nombre, { dir }]) => {
    const suyos = archivos(path.resolve(REPO, dir));
    const etiquetas = etiquetasDeLasFuentes(suyos);
    const codigo = suyos
      .filter((a) => !a.ruta.endsWith('.html') && !/\.spec\./.test(a.ruta))
      .map((a) => sinComentariosDeCodigo(a.fuente))
      .join('\n');
    for (const [clase, suyas] of deLibrerias) {
      if (new RegExp(`\\b${clase}\\b`).test(codigo)) for (const e of suyas) etiquetas.add(e);
    }
    return [nombre, etiquetas];
  }),
);

describe('una etiqueta cruda trae su bundle (ADR 0140 F4)', () => {
  it('hay sujeto: el registro, los elementos y el shell del QR que Eventos importa', () => {
    expect(REGISTRO.length).toBeGreaterThan(100);
    expect(pinta.size).toBeGreaterThan(100);
    expect([...deLibrerias.keys()]).toContain('CredentialWalletComponent');
    expect([...(pinta.get('eventos') ?? [])]).toEqual(
      expect.arrayContaining(['synergos-qr-code', 'synergos-seat-map', 'synergos-countdown-clock']),
    );
  });

  it('cada etiqueta cruda está en las dependencies de quien la pinta, salvo las censadas', () => {
    const { faltan } = revisarDependencias({ registro: REGISTRO, pinta });
    const nuevas = faltan.filter((f) => !HEREDADOS_SIN_DECLARAR.includes(f));
    const resueltas = HEREDADOS_SIN_DECLARAR.filter((h) => !faltan.includes(h));
    expect(
      nuevas,
      'Pinta una etiqueta cruda que el CMS no carga: el elemento queda sin definir y se ve el hueco. ' +
        'Declarala en `dependencies` de vitals/contracts/src/element-registry.json:',
    ).toEqual([]);
    expect(resueltas, 'Ya están declaradas: sacalas de HEREDADOS_SIN_DECLARAR.').toEqual([]);
  });

  it('el QR de cada entrada y la butaca de Eventos se cargan con la página de la compra', () => {
    const eventos = REGISTRO.find((e) => e.name === 'eventos');
    expect(eventos?.dependencies).toEqual(expect.arrayContaining(['qr-code', 'seat-map', 'countdown-clock']));
  });

  it('nadie declara una dependencia que no pinta, ni pinta una etiqueta que el registro no conoce', () => {
    const { sobran, desconocidas } = revisarDependencias({ registro: REGISTRO, pinta });
    expect(sobran, 'cada dependencia es un <script> más en la página').toEqual([]);
    expect(desconocidas, 'una etiqueta synergos-* sin elemento: o es un error, o va a AJENAS_AL_REGISTRO').toEqual([]);
  });
});

describe('el detector', () => {
  it('lee las plantillas y el código, sin la página de desarrollo, los specs ni los comentarios', () => {
    const etiquetas = etiquetasDeLasFuentes([
      { ruta: 'src/index.html', fuente: '<synergos-demo></synergos-demo>' },
      { ruta: 'src/x/x.html', fuente: '<!-- <synergos-viejo> --><synergos-qr-code [attr.data]="q"></synergos-qr-code>' },
      { ruta: 'src/x/x.ts', fuente: '// <synergos-comentado>\n/* <synergos-bloque> */\nconst t = `<synergos-seat-map></synergos-seat-map>`;' },
      { ruta: 'src/x/x.spec.ts', fuente: "el.innerHTML = '<synergos-del-spec>';" },
    ]);
    expect([...etiquetas].sort()).toEqual(['synergos-qr-code', 'synergos-seat-map']);
  });

  it('un componente de librería pinta lo de su plantilla en línea o la de su templateUrl', () => {
    const mapa = componentesQuePintan([
      { ruta: 'a.ts', fuente: '@Component({ template: `<synergos-qr-code />` })\nexport class BilleteraComponent {}' },
      { ruta: 'b.ts', fuente: "@Component({ templateUrl: './b.html' })\nexport class PanelComponent {}", plantilla: '<synergos-map-pin></synergos-map-pin>' },
      { ruta: 'c.ts', fuente: '/** pinta <synergos-nada> */\nexport class MudoComponent {}' },
    ]);
    expect([...mapa.keys()].sort()).toEqual(['BilleteraComponent', 'PanelComponent']);
    expect([...mapa.get('PanelComponent')]).toEqual(['synergos-map-pin']);
  });

  it('cruza en los dos sentidos, sin contar la etiqueta propia ni las ajenas al registro', () => {
    expect(Object.keys(AJENAS_AL_REGISTRO)).toContain('synergos-flujo');
    const registro = [
      { name: 'eventos', tag: 'synergos-eventos', dependencies: ['countdown-clock', 'faq-section'] },
      { name: 'qr-code', tag: 'synergos-qr-code' },
      { name: 'countdown-clock', tag: 'synergos-countdown-clock' },
      { name: 'faq-section', tag: 'synergos-faq-section' },
    ];
    const pinta = new Map([
      ['eventos', new Set(['synergos-eventos', 'synergos-flujo', 'synergos-qr-code', 'synergos-countdown-clock', 'synergos-inventada'])],
    ]);
    expect(revisarDependencias({ registro, pinta })).toEqual({
      faltan: ['eventos → qr-code'],
      sobran: ['eventos → faq-section'],
      desconocidas: ['eventos → <synergos-inventada>'],
    });
  });
});
