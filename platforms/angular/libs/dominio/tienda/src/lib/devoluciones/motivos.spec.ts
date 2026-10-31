import { MOTIVOS_DE_DEVOLUCION, etiquetaDelMotivo } from './motivos';

describe('los motivos de una devolución', () => {
  it('cada código tiene el texto que entiende quien compra', () => {
    expect(MOTIVOS_DE_DEVOLUCION.map(etiquetaDelMotivo)).toEqual([
      'Llegó dañado',
      'No funciona',
      'No es lo que decía la publicación',
      'Cambié de opinión',
    ]);
  });

  it('un texto libre de antes, o un nombre del prototipo, se dice tal cual', () => {
    expect(etiquetaDelMotivo('Llegó con teclas flojas')).toBe('Llegó con teclas flojas');
    expect(etiquetaDelMotivo('toString')).toBe('toString');
    expect(etiquetaDelMotivo('')).toBe('');
  });
});
