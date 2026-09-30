import { countdownMilestone } from './countdown-milestone.util';

const HITOS = [
  { atSeconds: 3600, message: 'Falta menos de una hora.' },
  { atSeconds: 60, message: 'Falta menos de un minuto.' },
  { atSeconds: 0, message: 'Empezó.' },
];

describe('countdownMilestone', () => {
  it('antes del primer umbral no hay hito', () => {
    expect(countdownMilestone(3601, HITOS)).toBe('');
  });

  it('dice lo MISMO durante toda la franja: es lo que hace que el reloj no hable cada segundo', () => {
    expect(countdownMilestone(3600, HITOS)).toBe('Falta menos de una hora.');
    expect(countdownMilestone(1800, HITOS)).toBe('Falta menos de una hora.');
    expect(countdownMilestone(61, HITOS)).toBe('Falta menos de una hora.');
  });

  it('gana el umbral más chico ya cruzado, sin importar el orden de la lista', () => {
    expect(countdownMilestone(30, [...HITOS].reverse())).toBe('Falta menos de un minuto.');
    expect(countdownMilestone(0, HITOS)).toBe('Empezó.');
    expect(countdownMilestone(-5, HITOS)).toBe('Empezó.');
  });

  it('sin cuenta que llevar, nada', () => {
    expect(countdownMilestone(null, HITOS)).toBe('');
    expect(countdownMilestone(Number.NaN, HITOS)).toBe('');
  });
});
