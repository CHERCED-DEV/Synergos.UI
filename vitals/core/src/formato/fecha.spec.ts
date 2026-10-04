import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { diaLocal, diaLocalMas } from './fecha';

// El defecto sólo se ve con un desfase negativo: en una máquina en UTC, el día UTC y el local
// coinciden y el test pasaría con el código de antes. Se fija la zona del sitio (UTC−5).
const zonaDeLaMaquina = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'America/Bogota';
});
afterAll(() => {
  if (zonaDeLaMaquina === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = zonaDeLaMaquina;
  }
});

describe('diaLocal', () => {
  it('a las 22:30 de Bogotá sigue siendo HOY, aunque en UTC ya sea mañana', () => {
    const noche = new Date(2026, 9, 3, 22, 30);
    // El control: con la zona fijada, el día UTC de esa hora ya es el 4.
    expect(noche.toISOString().slice(0, 10)).toBe('2026-10-04');

    expect(diaLocal(noche)).toBe('2026-10-03');
  });

  it('rellena mes y día a dos cifras', () => {
    expect(diaLocal(new Date(2026, 0, 5, 9, 0))).toBe('2026-01-05');
  });
});

describe('diaLocalMas', () => {
  it('suma días de calendario desde el día local, y cruza meses y años', () => {
    const noche = new Date(2026, 9, 3, 22, 30);
    expect(diaLocalMas(1, noche)).toBe('2026-10-04');
    expect(diaLocalMas(0, noche)).toBe('2026-10-03');
    expect(diaLocalMas(29, noche)).toBe('2026-11-01');
    expect(diaLocalMas(1, new Date(2026, 11, 31, 23, 59))).toBe('2027-01-01');
    expect(diaLocalMas(-1, new Date(2026, 2, 1, 0, 30))).toBe('2026-02-28');
  });
});
