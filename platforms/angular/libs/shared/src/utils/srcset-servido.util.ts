/**
 * El `srcset` de una foto que el CMS ya sirve a un ancho (D-016-Y7): una URL con `width=N` y `format=webp` (la de
 * `ImagenServida`) se pide también a 800 px, para que el teléfono no baje la de escritorio. A 375 px el carrusel de
 * /propiedades/ pasaba de 282 KB a 103 KB. Una URL sin ese ancho (un SVG, un enlace externo) no lleva `srcset`.
 */
export function srcsetServido(url: string | null | undefined, anchos: readonly number[] = [800]): string | null {
  if (!url) {
    return null;
  }
  const pedido = /[?&]width=(\d+)/.exec(url);
  if (!pedido || !/[?&]format=webp/.test(url)) {
    return null;
  }
  const tope = Number(pedido[1]);
  const menores = anchos.filter((ancho) => ancho < tope);
  if (menores.length === 0) {
    return null;
  }
  return [...menores, tope].map((ancho) => `${url.replace(/([?&]width=)\d+/, `$1${ancho}`)} ${ancho}w`).join(', ');
}
