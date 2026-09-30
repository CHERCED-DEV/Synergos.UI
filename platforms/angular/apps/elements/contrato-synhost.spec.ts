import { CLAVES_DE_ENVOLTURA_SYNHOST, ELEMENTOS_SYNHOST } from '@synergos/contracts';
import { createConfigInputTransform } from '@synergos/shared';
import { sanitizeKpiCardConfig } from './modules/kpi-card/src/kpi-card/kpi-card';
import { sanitizeDropdownConfig } from './compositions/dropdown/src/dropdown/dropdown';
import { sanitizeCarouselConfig } from './modules/carousel/src/carousel/carousel';
import { sanitizeRatingStarsConfig } from './compositions/rating-stars/src/rating-stars/rating-stars';
import { sanitizeTagConfig } from './primitives/tag/src/tag/tag';
import { sanitizeScrollTopConfig } from './primitives/scroll-top/src/scroll-top/scroll-top';

/**
 * El gate que EJECUTA el sanitizador de cada elemento con el `config` que emite su vista
 * (ADR 0135 · CMS#173).
 *
 * El tipado ya impide leer una clave que el CMS no manda (TS2339). Lo que el tipado NO ve es
 * la mitad contraria: una clave que el CMS manda, que el tipo acepta y que el sanitizador
 * tira —o no lee—. Es la forma exacta en que se midió D1: sanitizador ejecutado con el payload
 * de la vista. Acá el payload no se inventa: es el `ejemplo` del contrato, que el CMS saca de
 * su resolver y su emitter REALES.
 *
 * Cada entrada de esta tabla es un sanitizador envuelto como lo envuelve su componente
 * (`createConfigInputTransform`), así que corre el mismo camino que el atributo `config`.
 * La tabla es a mano, y por eso se cruza en los dos sentidos con el contrato: un elemento
 * con contrato y sin sanitizador acá se pone rojo, que es la red de seguridad por el vacío.
 */
const SANITIZADORES: Readonly<Record<string, (config: unknown) => unknown>> = {
  carousel: createConfigInputTransform(sanitizeCarouselConfig),
  dropdown: createConfigInputTransform(sanitizeDropdownConfig),
  'kpi-card': createConfigInputTransform(sanitizeKpiCardConfig),
  'rating-stars': createConfigInputTransform(sanitizeRatingStarsConfig),
  tag: createConfigInputTransform(sanitizeTagConfig),
  'scroll-top': createConfigInputTransform(sanitizeScrollTopConfig),
};

type Config = Record<string, unknown>;

const esObjeto = (v: unknown): v is Config => typeof v === 'object' && v !== null && !Array.isArray(v);

describe('contrato SynHost: cada sanitizador, ejecutado con el config que emite su vista', () => {
  it('cada elemento del contrato tiene su sanitizador en esta tabla, y al revés', () => {
    const nombres = ELEMENTOS_SYNHOST.map((e) => e.nombre);

    expect(nombres.length).toBeGreaterThan(0);
    expect(nombres.filter((n) => !(n in SANITIZADORES))).toEqual([]);
    expect(Object.keys(SANITIZADORES).filter((n) => !nombres.includes(n))).toEqual([]);
  });

  for (const elemento of ELEMENTOS_SYNHOST) {
    describe(elemento.nombre, () => {
      const ejemplo = elemento.ejemplo as unknown as Config;
      // Se ejecuta con el atributo como llega: una cadena JSON.
      const salida = (config: Config) => JSON.stringify(SANITIZADORES[elemento.nombre]?.(JSON.stringify(config)) ?? null);

      it('la muestra del CMS ejercita todos los campos del record, los de sus listas incluidos', () => {
        expect(elemento.campos.filter((campo) => !(campo in ejemplo))).toEqual([]);

        const listas = elemento.listas as Readonly<Record<string, readonly string[]>>;
        const sinViajar = Object.entries(listas).flatMap(([campo, internos]) => {
          const items = Array.isArray(ejemplo[campo]) ? (ejemplo[campo] as unknown[]).filter(esObjeto) : [];
          return internos.filter((i) => !items.some((item) => i in item)).map((i) => `${campo}[].${i}`);
        });
        expect(sinViajar).toEqual([]);
      });

      it('cada clave que viaja mueve la salida del sanitizador', () => {
        const completa = salida(ejemplo);
        const muertas = Object.keys(ejemplo)
          .filter((clave) => !CLAVES_DE_ENVOLTURA_SYNHOST.includes(clave as never))
          .filter((clave) => {
            const sin = { ...ejemplo };
            delete sin[clave];
            return salida(sin) === completa;
          });

        expect(muertas).toEqual([]);
      });

      it('cada campo de un ítem de lista mueve la salida del sanitizador', () => {
        const completa = salida(ejemplo);
        const muertas: string[] = [];

        for (const [clave, valor] of Object.entries(ejemplo)) {
          if (!Array.isArray(valor)) continue;
          const campos = new Set(valor.filter(esObjeto).flatMap((item) => Object.keys(item)));
          for (const campo of campos) {
            const sin = {
              ...ejemplo,
              [clave]: valor.map((item) => {
                if (!esObjeto(item)) return item;
                const copia = { ...item };
                delete copia[campo];
                return copia;
              }),
            };
            if (salida(sin) === completa) muertas.push(`${clave}[].${campo}`);
          }
        }

        expect(muertas).toEqual([]);
      });
    });
  }
});
