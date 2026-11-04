import { Injector } from '@angular/core';
import { TEXTOS_DE_SALUD, type TextosDeSalud } from '../comun/textos';
import { faltaElPermiso } from '../permiso/permiso';
import { AgendaDeSalud, franjasDelAsistente } from './agenda';

/** Los textos los provee la app; la fachada decide CUÁL se dice. Estos dicen cuál se eligió. */
const TEXTOS: TextosDeSalud = {
  permiso: {
    titulo: 'titulo',
    proposito: 'proposito',
    uso: 'uso',
    responsable: 'responsable',
    aceptar: 'aceptar',
    retirar: 'retirar',
    dado: 'dado',
    retirado: 'retirado',
  },
  mensajeDeLaCita: (code) => `rechazo ${code}`,
  sinHorasLibres: 'sin horas libres',
};

/** Lo que contesta la lectura `disponibilidad`: un lunes de 2027 en Bogotá, por franjas de 20 minutos. */
const AGENDA = [
  { ventana: { start: '2027-03-15T14:40:00Z', end: '2027-03-15T15:00:00Z' }, libres: 1 },
  { ventana: { start: '2027-03-15T14:00:00Z', end: '2027-03-15T14:20:00Z' }, libres: 1 },
  { ventana: { start: '2027-03-15T14:20:00Z', end: '2027-03-15T14:40:00Z' }, libres: 0 },
];
const ANTES = Date.parse('2027-03-15T13:00:00Z');

describe('Las franjas que ofrece el asistente (T046, en el dominio con T051)', () => {
  it('son las libres que no empezaron, en el día y la hora del sitio, en orden y con su duración', () => {
    expect(franjasDelAsistente(AGENDA, 'America/Bogota', ANTES)).toEqual([
      { date: '2027-03-15', time: '09:00', minutos: 20 },
      { date: '2027-03-15', time: '09:40', minutos: 20 },
    ]);
  });

  it('una que ya empezó no se ofrece', () => {
    expect(franjasDelAsistente(AGENDA, 'America/Bogota', Date.parse('2027-03-15T14:10:00Z'))).toEqual([
      { date: '2027-03-15', time: '09:40', minutos: 20 },
    ]);
  });

  it('sin una zona válida no ofrece ninguna: no adivina la hora', () => {
    expect(franjasDelAsistente(AGENDA, 'No/Existe', ANTES)).toEqual([]);
    expect(franjasDelAsistente(AGENDA, '', ANTES)).toEqual([]);
  });
});

describe('La fachada de la agenda (T051)', () => {
  const agenda = (): AgendaDeSalud =>
    Injector.create({
      providers: [
        { provide: TEXTOS_DE_SALUD, useValue: TEXTOS },
        { provide: AgendaDeSalud, useClass: AgendaDeSalud, deps: [] },
      ],
    }).get(AgendaDeSalud);

  it('mientras se lee no dice nada; sin horas libres lo dice; con horas, calla', () => {
    const a = agenda();
    expect(a.aviso()).toBeNull();

    a.franjas.set([]);
    expect(a.aviso()).toBe('sin horas libres');

    a.franjas.set([{ date: '2027-03-15', time: '09:00', minutos: 20 }]);
    expect(a.aviso()).toBeNull();
  });

  it('una agenda que no se pudo leer lo dice por su code, antes que la falta de horas', () => {
    const a = agenda();
    a.franjas.set([]);
    a.rechazo.set('booking.resource_not_found');

    expect(a.aviso()).toBe('rechazo booking.resource_not_found');
  });

  it('la duración es la de la franja leída; una que no está en la agenda no tiene', () => {
    const a = agenda();
    a.franjas.set([{ date: '2027-03-15', time: '09:40', minutos: 20 }]);

    expect(a.minutosDe('2027-03-15', '09:40')).toBe(20);
    expect(a.minutosDe('2027-03-16', '09:40')).toBeNull();
  });
});

describe('Si falta el permiso de datos de salud (T050, en el dominio con T051)', () => {
  it('falta si no se dio, se retiró o venció; otro rechazo no es eso', () => {
    expect(['consent.not_granted', 'consent.revoked', 'consent.expired'].map(faltaElPermiso)).toEqual([true, true, true]);
    expect([null, undefined, '', 'pricing.unavailable', 'booking.at_capacity'].map(faltaElPermiso)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});
