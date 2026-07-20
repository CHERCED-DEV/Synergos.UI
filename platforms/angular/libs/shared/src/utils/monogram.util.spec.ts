import { monogram } from './monogram.util';

// Casos límite del monograma. Vivían en `product-card.spec.ts`; se mudaron aquí
// junto a la regla cuando storefront y product-card dejaron de tener cada uno su
// copia. Son los que fijan la versión POR PUNTOS DE CÓDIGO frente a `charAt(0)`.
describe('monogram', () => {
  it('toma la inicial de las dos primeras palabras con carga', () => {
    expect(monogram('Silla Nórdica Roble')).toBe('SN');
  });

  it('salta las palabras vacías (de, la, con…)', () => {
    expect(monogram('Café de Colombia')).toBe('CC');
  });

  it('con una sola palabra usa sus dos primeras letras', () => {
    expect(monogram('Silla')).toBe('SI');
  });

  it('ignora comillas y puntuación de apertura', () => {
    expect(monogram('«Silla»')).toBe('SI');
    expect(monogram('"Mesa Roble"')).toBe('MR');
  });

  it('ignora un emoji inicial en vez de partirlo por la mitad', () => {
    // Con charAt(0) esto imprimiría media pareja subrogada (un rombo ).
    expect(monogram('🎁 Caja Regalo')).toBe('CR');
  });

  it('cae a · cuando no queda ninguna letra', () => {
    expect(monogram('')).toBe('·');
    expect(monogram('   ')).toBe('·');
    expect(monogram('🎁')).toBe('·');
    expect(monogram('!!!')).toBe('·');
  });

  // El storefront llamaba con `product.title` crudo y se protegía con `title || ''`.
  // Al centralizar, esa guarda es del util: ningún consumidor la repite.
  it('trata null / undefined como título vacío', () => {
    expect(monogram(null)).toBe('·');
    expect(monogram(undefined)).toBe('·');
  });

  it('nunca devuelve más de dos caracteres, ni cuando mayusculizar alarga', () => {
    // 'ß'.toUpperCase() === 'SS' — dos caracteres a partir de uno.
    expect(monogram('ßeta').length).toBe(2);
    expect(Array.from(monogram('Silla Nórdica Roble')).length).toBe(2);
  });

  it('funciona con alfabetos no latinos', () => {
    expect(monogram('Ωmega Δelta')).toBe('ΩΔ');
  });
});
