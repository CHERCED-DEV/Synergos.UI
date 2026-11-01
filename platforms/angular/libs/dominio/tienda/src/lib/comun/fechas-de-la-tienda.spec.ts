import { diaDeLaTienda, momentoDeLaTienda } from './fechas-de-la-tienda';

/**
 * Las fechas de «Mis compras» (004-tienda-compra, etapa 3): en es-CO y en la hora del SITIO, nunca el ISO crudo.
 * El instante de las pruebas cae del otro lado de la medianoche según la zona: a las 02:30 UTC del 23 en Bogotá
 * todavía son las 21:30 del 22, y en Madrid ya son las 04:30 del 23. Un formateador que mirara UTC o el navegador
 * diría otro día.
 */
describe('fechas de la tienda', () => {
  const INSTANTE = '2026-10-23T02:30:00+00:00';

  it('el día del pedido es el que marca el SITIO, con el mes en es-CO', () => {
    expect(diaDeLaTienda(INSTANTE, 'America/Bogota')).toBe('22 de octubre de 2026');
    expect(diaDeLaTienda(INSTANTE, 'Europe/Madrid')).toBe('23 de octubre de 2026');
  });

  it('una etapa del seguimiento lleva el día y la hora de reloj del sitio', () => {
    expect(momentoDeLaTienda(INSTANTE, 'America/Bogota')).toBe('22 de octubre de 2026, 21:30');
    expect(momentoDeLaTienda('2026-10-23T02:30:00Z', 'Europe/Madrid')).toBe('23 de octubre de 2026, 04:30');
  });

  it('sin una zona válida, la del navegador: nunca el ISO crudo', () => {
    const dia = diaDeLaTienda(INSTANTE, '');
    expect(dia).not.toContain('T02:30');
    expect(dia).toMatch(/^\d{1,2} de octubre de 2026$/);
    expect(momentoDeLaTienda(INSTANTE, 'Zona/Inventada')).toMatch(/^\d{1,2} de octubre de 2026, \d{2}:\d{2}$/);
  });

  it('lo que no es un instante se deja como llegó, sin inventarle una fecha', () => {
    expect(diaDeLaTienda('pronto', 'America/Bogota')).toBe('pronto');
    expect(momentoDeLaTienda('', 'America/Bogota')).toBe('');
  });
});
