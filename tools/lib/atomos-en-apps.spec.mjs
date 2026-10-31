import { describe, expect, it } from 'vitest';

import { controlesDeLaApp, controlesDeLaPlantilla, cruzarConElPiso, pisoDe, suma } from './atomos-en-apps.mjs';

/**
 * El detector de `gate:atomos` (014-despiece-tienda, T002): qué cuenta como control escrito a mano en una app, y el cruce
 * con su piso.
 */
describe('controlesDeLaPlantilla', () => {
  it('cuenta las cuatro etiquetas y no los átomos', () => {
    const n = controlesDeLaPlantilla(
      '<button type="button">A</button><input type="text" /><select></select><textarea></textarea>' +
        '<syn-button label="B" /><syn-input /><syn-select /><syn-textarea />',
    );
    expect(n).toEqual({ button: 1, input: 1, select: 1, textarea: 1 });
  });

  it('no cuenta lo que está en un comentario ni una etiqueta que sólo empieza igual', () => {
    expect(suma(controlesDeLaPlantilla('<!-- <button>viejo</button> --><buttonbar></buttonbar><input-mask />'))).toBe(0);
  });
});

describe('controlesDeLaApp', () => {
  it('suma las plantillas y las plantillas en línea, nunca las pruebas', () => {
    const n = controlesDeLaApp([
      { ruta: 'a/x.html', fuente: '<button></button>' },
      { ruta: 'a/y.ts', fuente: 'const t = "<button>"; @Component({ template: `<input /><button></button>` })' },
      { ruta: 'a/y.spec.ts', fuente: '@Component({ template: `<button></button>` })' },
      { ruta: 'a/y.scss', fuente: 'button { color: red; }' },
    ]);
    expect(n).toEqual({ button: 2, input: 1, select: 0, textarea: 0 });
  });
});

describe('cruzarConElPiso', () => {
  it('una app obligatoria con un control a mano es un error', () => {
    expect(cruzarConElPiso({ storefront: 1 }, { obligatorias: ['storefront'] }).errores).toEqual([
      'storefront: 1 a mano y es obligatoria (0)',
    ]);
  });

  it('subir del piso es un error; bajar pide reescribirlo', () => {
    const r = cruzarConElPiso({ ehr: 58, gov: 20 }, { piso: { ehr: 57, gov: 27 } });
    expect(r.errores).toEqual(['ehr: 57 → 58']);
    expect(r.bajaron).toEqual(['gov: 27 → 20']);
  });

  it('una app del piso o de las obligatorias que ya no existe es un error', () => {
    expect(cruzarConElPiso({}, { obligatorias: ['seller'], piso: { blogs: 3 } }).errores).toEqual([
      'la app obligatoria «seller» no existe',
      'el piso nombra «blogs», que ya no existe',
    ]);
  });
});

describe('pisoDe', () => {
  it('nunca sube un piso, deja fuera a las obligatorias y ordena', () => {
    expect(pisoDe({ gov: 30, academy: 10, seller: 0 }, { obligatorias: ['seller'], piso: { gov: 27, academy: 38, seller: 5 } })).toEqual({
      academy: 10,
      gov: 27,
    });
  });
});
