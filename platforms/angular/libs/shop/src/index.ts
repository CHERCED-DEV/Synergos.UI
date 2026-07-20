// Public API Surface of @synergos/shop
//
// Piezas del dominio Tienda que MÁS DE UN elemento compone.
//
// Por qué existe esta lib (ADR 0113): cada elemento publicado a la CDN es una
// *app* de Nx (tiene su propio `main.ts` que hace `customElements.define`), y
// una app no puede ser importada por nadie — Nx lo dice literal: «Imports of
// apps are forbidden». Pero `cart-summary` SÍ compone `cart-item`, y
// `product-detail` compone `price-display`/`quantity-selector`/`variant-picker`.
// Esa composición es deliberada (los tags `tier:` la contemplan); lo que estaba
// mal era el mecanismo: rutas relativas `../../../` hacia dentro de otra app.
//
// El patrón: el COMPONENTE vive aquí; la app se queda como bootstrap fino que lo
// monta como custom element. Así el componente se compone por nombre
// (`@synergos/shop`) y además se sigue publicando como su propio bundle.
//
// Regla: aquí solo entra lo que comparten VARIOS elementos. Un componente que
// solo usa su propia app se queda en la app.

export { cartStore } from './lib/cart.store';
export { QuantitySelectorComponent } from './lib/quantity-selector/quantity-selector';
export { PriceDisplayComponent } from './lib/price-display/price-display';
export { VariantPickerComponent } from './lib/variant-picker/variant-picker';
export { CartItemComponent } from './lib/cart-item/cart-item';
