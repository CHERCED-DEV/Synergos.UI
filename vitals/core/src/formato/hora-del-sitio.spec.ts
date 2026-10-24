import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fechaEnZona, horaEnZona, instanteEnZona, relojEnZona, zonaValida } from './hora-del-sitio';

// La zona de la MÁQUINA no puede contar: se fija una que no es la de ningún sitio de los tests. Si algo leyera la
// hora del navegador en vez de la del sitio, saldría corrido.
const zonaDeLaMaquina = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'Asia/Tokyo';
});
afterAll(() => {
  if (zonaDeLaMaquina === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = zonaDeLaMaquina;
  }
});

const iso = (ms: number): string => new Date(ms).toISOString();

describe('zonaValida', () => {
  it('conoce una zona IANA y rechaza la que no lo es, la vacía y la que falta', () => {
    expect(zonaValida('America/Bogota')).toBe(true);
    expect(zonaValida('Europe/Madrid')).toBe(true);
    expect(zonaValida('America/Marte')).toBe(false);
    expect(zonaValida('')).toBe(false);
    expect(zonaValida(null)).toBe(false);
    expect(zonaValida(undefined)).toBe(false);
  });
});

describe('instanteEnZona', () => {
  it('las 10:00 de Bogotá (UTC−5) son las 15:00 UTC, la del sitio y no la de la máquina', () => {
    expect(iso(instanteEnZona('2026-10-20', '10:00', 'America/Bogota'))).toBe('2026-10-20T15:00:00.000Z');
  });

  it('las 23:30 de Bogotá caen al día siguiente en UTC', () => {
    expect(iso(instanteEnZona('2026-10-20', '23:30', 'America/Bogota'))).toBe('2026-10-21T04:30:00.000Z');
  });

  it('un sitio al este de Greenwich resta', () => {
    expect(iso(instanteEnZona('2026-07-15', '10:00', 'Europe/Madrid'))).toBe('2026-07-15T08:00:00.000Z');
    expect(iso(instanteEnZona('2026-01-15', '10:00', 'Europe/Madrid'))).toBe('2026-01-15T09:00:00.000Z');
  });

  it('el día del cambio de hora usa el desfase de DESPUÉS del cambio, no el de la medianoche', () => {
    // Madrid pasa a verano el 29 de marzo de 2026 a las 02:00 (+01:00 → +02:00): a las 10:00 ya es +02:00.
    expect(iso(instanteEnZona('2026-03-29', '10:00', 'Europe/Madrid'))).toBe('2026-03-29T08:00:00.000Z');
    // Y vuelve el 25 de octubre a las 03:00 (+02:00 → +01:00): a las 10:00 ya es +01:00.
    expect(iso(instanteEnZona('2026-10-25', '10:00', 'Europe/Madrid'))).toBe('2026-10-25T09:00:00.000Z');
  });

  it('una hora de reloj justo ANTES del cambio usa el desfase de antes, aunque el de su hora UTC ya sea el nuevo', () => {
    // Las 01:30 del 29 de marzo en Madrid son +01:00 (00:30 UTC); el desfase de las 01:30 UTC ya es +02:00. Una
    // sola pasada daría las 23:30 UTC del día anterior: la cita una hora antes.
    expect(iso(instanteEnZona('2026-03-29', '01:30', 'Europe/Madrid'))).toBe('2026-03-29T00:30:00.000Z');
  });

  it('no inventa un instante con una fecha o una hora que no lo son', () => {
    expect(instanteEnZona('20-10-2026', '10:00', 'America/Bogota')).toBeNaN();
    expect(instanteEnZona('2026-10-20', '25:00', 'America/Bogota')).toBeNaN();
    expect(instanteEnZona('2026-10-20', '9:00', 'America/Bogota')).toBeNaN();
  });
});

describe('la lectura de vuelta', () => {
  it('el día y la hora de reloj que marca el sitio en ese instante, desde ms o desde ISO', () => {
    expect(relojEnZona('2026-10-21T04:30:00Z', 'America/Bogota')).toEqual({ fecha: '2026-10-20', hora: '23:30' });
    expect(relojEnZona(Date.UTC(2026, 6, 15, 8, 0), 'Europe/Madrid')).toEqual({ fecha: '2026-07-15', hora: '10:00' });
  });

  it('la medianoche se lee 00:00, nunca 24:00', () => {
    expect(relojEnZona('2026-10-20T05:00:00Z', 'America/Bogota')).toEqual({ fecha: '2026-10-20', hora: '00:00' });
  });

  it('ida y vuelta: lo que se eligió es lo que se lee', () => {
    for (const zona of ['America/Bogota', 'Europe/Madrid', 'Asia/Kolkata']) {
      for (const [fecha, hora] of [['2026-03-29', '10:00'], ['2026-10-25', '07:15'], ['2026-12-31', '23:45']] as const) {
        expect(relojEnZona(instanteEnZona(fecha, hora, zona), zona)).toEqual({ fecha, hora });
      }
    }
  });

  it('sin zona válida o sin instante no hay lectura', () => {
    expect(relojEnZona('2026-10-21T04:30:00Z', 'America/Marte')).toBeNull();
    expect(relojEnZona('no es un instante', 'America/Bogota')).toBeNull();
    expect(relojEnZona(Number.NaN, 'America/Bogota')).toBeNull();
  });

  it('fechaEnZona y horaEnZona son sus dos mitades, y vacías cuando no hay lectura', () => {
    expect(fechaEnZona('2026-10-21T04:30:00Z', 'America/Bogota')).toBe('2026-10-20');
    expect(horaEnZona('2026-10-21T04:30:00Z', 'America/Bogota')).toBe('23:30');
    expect(fechaEnZona('no es un instante', 'America/Bogota')).toBe('');
    expect(horaEnZona(Date.UTC(2026, 6, 15, 8, 0), 'America/Marte')).toBe('');
  });
});
