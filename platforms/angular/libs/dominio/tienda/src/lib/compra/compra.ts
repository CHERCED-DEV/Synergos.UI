import { Injectable, computed, inject, signal } from '@angular/core';
import { HostIdentityService } from '@synergos/core';
import type { ShopCustomer } from './compra.model';

/**
 * La compra de una tienda (014-despiece-tienda, T010): quién compra y a dónde se envía, cómo paga, y el pedido que
 * quedó. Lo comparten el pago, la confirmación, «Mis compras» y el enrutado.
 */
@Injectable()
export class CompraDeLaTienda {
  readonly #identity = inject(HostIdentityService);

  // ─── Confirmation ───────────────────────────────────────────────────────────
  readonly orderRef = signal('');

  readonly orderNumber = signal('');

  readonly confirmedItems = signal<readonly { title: string; qty: number; reference: string }[]>(
    [],
  );

  readonly isAuthenticated = this.#identity.isAuthenticated;

  /** Correo del miembro, para que la cuenta muestre con quién está trabajando. */
  readonly memberEmail = this.#identity.email;

  readonly customerName = signal(this.#identity.displayName());

  readonly customerEmail = signal(this.#identity.email());

  readonly customerAddress = signal('');

  readonly customerCity = signal('');

  readonly paymentMethod = signal<'card' | 'pse'>('card');

  readonly customerNameValid = computed(() => this.customerName().trim().length >= 2);

  readonly customerEmailValid = computed(() => /.+@.+\..+/.test(this.customerEmail().trim()));

  readonly shippingValid = computed(
    () =>
      this.customerNameValid() &&
      this.customerEmailValid() &&
      this.customerAddress().trim().length > 3 &&
      this.customerCity().trim().length > 1,
  );

  checkoutCustomer(): ShopCustomer {
    return {
      name: this.customerName().trim(),
      email: this.customerEmail().trim(),
      address: this.customerAddress().trim(),
      city: this.customerCity().trim(),
    };
  }

  // ─── Checkout (SH-3 wiring) ──────────────────────────────────────────────────
  setPaymentMethod(method: 'card' | 'pse'): void {
    this.paymentMethod.set(method);
  }
}
