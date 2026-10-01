import { afterEach, describe, expect, it } from 'vitest';

import { t } from './synergos-bridge';

/**
 * `t()` — el helper con el que una funcionalidad (o una pieza colocable) traduce su microcopia
 * con el diccionario que publica el CMS (ADR 0136, piloto CMS#186).
 *
 * Se prueba contra un `window.synergos` con la forma que emite `_SynergosBridge.cshtml`,
 * incluido su `i18n.t` inline: es la que el helper usa primero.
 */
type ConVentana = { window?: unknown };

function conBridge(keys: Record<string, string>): void {
  const i18n = {
    culture: 'es-CO',
    defaultCulture: 'es-CO',
    keys,
    t(this: { keys: Record<string, string> }, k: string, f?: string) {
      if (this.keys && this.keys[k] !== undefined) return this.keys[k];
      return f !== undefined ? f : k;
    },
  };
  (globalThis as ConVentana).window = { synergos: { i18n } };
}

afterEach(() => {
  delete (globalThis as ConVentana).window;
});

describe('t()', () => {
  it('sin bridge (standalone) devuelve el respaldo, nunca la clave', () => {
    expect(t('Slider.Next', 'Siguiente diapositiva')).toBe('Siguiente diapositiva');
  });

  it('con la clave publicada devuelve su texto', () => {
    conBridge({ 'Slider.Next': 'Next slide' });
    expect(t('Slider.Next', 'Siguiente diapositiva')).toBe('Next slide');
  });

  it('una clave que la página no publica sale por el respaldo', () => {
    conBridge({ 'Slider.Next': 'Next slide' });
    expect(t('Slider.Previous', 'Diapositiva anterior')).toBe('Diapositiva anterior');
  });

  it('rellena los marcadores CON NOMBRE, que son los del diccionario (20 de 25 claves)', () => {
    conBridge({ 'Rating.Stars.Aria': '{n} de {max} estrellas' });
    expect(t('Rating.Stars.Aria', '{n} out of {max} stars', { n: 4, max: 5 })).toBe('4 de 5 estrellas');
  });

  it('un marcador con nombre que no se pasa queda escrito: no se inventa un valor', () => {
    expect(t('X.Y', '{count} de {total}', { count: 3 })).toBe('3 de {total}');
  });

  it('sigue rellenando los posicionales', () => {
    expect(t('Admin.Welcome', 'Hola, {0} ({1})', 'Ana', 'admin')).toBe('Hola, Ana (admin)');
  });

  it('un objeto entre VARIOS argumentos es posicional, no un mapa de marcadores', () => {
    expect(t('X.Y', '{0}|{1}', { a: 1 }, 2)).toBe('[object Object]|2');
  });
});
