import { Injectable, computed, inject, signal } from '@angular/core';
import { FulfillmentContext, SessionStore, TransactionEventBusService } from '@synergos/transaction-engine';
import type { Author, CreatorTier } from '../comun/blogs.model';
import { RedDeBlogs } from '../comun/red-de-blogs';
import { TEXTOS_DE_BLOGS } from '../comun/textos';

/**
 * La suscripción y la propina, **declaradas y apagadas** (012-blogs-social, I0, P5 A). Su pago es local —el asistente
 * aceptaba con una referencia inventada— y no hay cobro real detrás, así que la pantalla no las ofrece: ni el estudio
 * enseña la monetización, ni `#/suscribir` abre el asistente. El código se queda (superset) para cuando la capacidad de
 * pagos cobre de verdad.
 */
export const SUSCRIPCION_ENCENDIDA = false;

/** Typed event map for the transaction bus (blogs ↔ monetización). */
export interface BusDeBlogs extends Record<string, unknown> {
  readonly subscribed: { readonly creatorKey: string; readonly tierId: string };
}

/** El resultado del asistente de pago (SH-3): su referencia. */
export interface ResultadoDeLaSuscripcion {
  readonly reference: string;
}

/** Suscribirse a quien escribe (012-blogs-social, I2): el plan, el carrito sobre el motor y la confirmación. */
@Injectable()
export class SuscripcionDeBlogs {
  readonly #red = inject(RedDeBlogs);
  readonly #store = inject(SessionStore);
  readonly #fulfillment = inject(FulfillmentContext);
  readonly #bus = inject<TransactionEventBusService<BusDeBlogs>>(TransactionEventBusService);
  readonly #textos = inject(TEXTOS_DE_BLOGS);

  readonly subscribeTier = signal<CreatorTier | null>(null);
  readonly subscribeCreator = signal<Author | null>(null);
  readonly confirmedMembership = signal<string>('');

  readonly subscribeValidity = computed<Readonly<Record<string, boolean>>>(() => ({
    plan: this.subscribeTier() !== null,
    pago: true,
    revisar: this.subscribeTier() !== null,
  }));

  readonly subscribeInstrument = computed<Readonly<Record<string, unknown>>>(() => ({
    provider: 'blogs-subscription',
    creatorKey: this.subscribeCreator()?.actorKey ?? '',
    tierId: this.subscribeTier()?.id ?? '',
  }));

  /** Open the subscribe wizard for a creator's tier (called from studio or profile). */
  startSubscribe(creator: Author, tier: CreatorTier): void {
    if (!SUSCRIPCION_ENCENDIDA) {
      // Apagada (P5 A): su pago es local y no cobra; la pantalla no la ofrece, y aquí tampoco se abre.
      return;
    }
    this.subscribeCreator.set(creator);
    this.subscribeTier.set(tier);
    this.confirmedMembership.set('');
    this.#store.reset();
    void this.selectTierIntoCart(creator, tier);
    this.#red.navegacion?.aplicar('subscribe');
    this.#red.navegacion?.escribirRuta('subscribe');
  }

  private async selectTierIntoCart(creator: Author, tier: CreatorTier): Promise<void> {
    const session = this.#store.getValidSession();
    const selection = await this.#fulfillment.select(
      {
        productRef: `${creator.actorKey}:${tier.id}`,
        kind: 'subscription',
        label: `${tier.name} · @${creator.handle}`,
        amount: tier.priceMinor,
        selection: {
          creatorKey: creator.actorKey,
          creatorName: creator.displayName,
          tierId: tier.id,
          tierName: tier.name,
          kind: 'subscription',
        },
      },
      session,
    );
    this.#store.reset();
    this.#store.addItem(selection.item);
    this.#store.setPricing({
      currency: tier.currency,
      totalAmount: tier.priceMinor,
      balanceDue: tier.priceMinor,
      breakdown: [{ code: 'base', label: this.#textos.membresia(tier.name), amount: tier.priceMinor }],
    });
  }

  selectTier(tier: CreatorTier): void {
    const creator = this.subscribeCreator();
    if (creator) {
      this.subscribeTier.set(tier);
      void this.selectTierIntoCart(creator, tier);
    }
  }

  onSubscribeCompleted(result: ResultadoDeLaSuscripcion): void {
    const creator = this.subscribeCreator();
    const tier = this.subscribeTier();
    this.confirmedMembership.set(result.reference);
    this.#store.reset();
    if (creator && tier) {
      const payload = { creatorKey: creator.actorKey, tierId: tier.id };
      this.#red.eventos.subscribed(payload);
      this.#bus.publish('subscribed', payload);
    }
  }

  onSubscribeExit(): void {
    this.#red.navegacion?.go('studio');
  }
}
