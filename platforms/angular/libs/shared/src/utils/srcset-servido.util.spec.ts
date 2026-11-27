import { srcsetServido } from './srcset-servido.util';

describe('srcsetServido', () => {
  it('una foto servida a 1600 se ofrece también a 800, para el teléfono', () => {
    expect(srcsetServido('/media/a/sala.jpg?width=1600&format=webp&quality=80')).toBe(
      '/media/a/sala.jpg?width=800&format=webp&quality=80 800w, /media/a/sala.jpg?width=1600&format=webp&quality=80 1600w',
    );
  });

  it('una foto ya pedida a 800 o menos no lleva srcset', () => {
    expect(srcsetServido('/media/a/sala.jpg?width=640&format=webp&quality=80')).toBeNull();
  });

  it('lo que no sirve el CMS a un ancho no lleva srcset', () => {
    expect(srcsetServido('/media/a/plano.svg')).toBeNull();
    expect(srcsetServido('https://otro.sitio/foto.jpg?width=1600')).toBeNull();
    expect(srcsetServido(null)).toBeNull();
  });
});
