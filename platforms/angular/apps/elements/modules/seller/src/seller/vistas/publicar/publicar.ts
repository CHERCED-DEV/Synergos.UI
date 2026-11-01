import { ChangeDetectionStrategy, Component, computed, CUSTOM_ELEMENTS_SCHEMA, inject, signal, viewChild } from '@angular/core';
import {
  PublicacionesDelVendedorApi,
  type SellerPublishReceipt,
  type SellerPublishRequest,
} from '@synergos/dominio/tienda';
import {
  ButtonComponent,
  IconButtonComponent,
  InputComponent,
  SelectComponent,
  type SelectOption,
  TextareaComponent,
} from '@synergos/shared';
import { type AuthoringDraft, AuthoringWizardComponent, type AuthoringWizardConfig } from '@synergos/shells';
import { EstadoDeLaConsola } from '../../estado/estado-de-la-consola';
import { PresentacionDeLaConsola } from '../../estado/presentacion';

/** Wizard steps: datos → media (URLs) → precio/stock → preview → publicar. */
const PUBLISH_STEPS = [
  { id: 'datos', label: 'Datos' },
  { id: 'media', label: 'Fotos' },
  { id: 'precio', label: 'Precio y stock' },
  { id: 'preview', label: 'Revisar' },
] as const;

/** Publicar un producto sobre SH-6, con el borrador que sobrevive a recargar. (014-despiece-tienda, T011) */
@Component({
  selector: 'sg-consola-publicar',
  standalone: true,
  imports: [AuthoringWizardComponent, ButtonComponent, IconButtonComponent, InputComponent, SelectComponent, TextareaComponent],
  templateUrl: './publicar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'seller__vista' },
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ConsolaPublicarComponent {
  readonly #publicaciones = inject(PublicacionesDelVendedorApi);
  protected readonly estado = inject(EstadoDeLaConsola);
  protected readonly presentacion = inject(PresentacionDeLaConsola);

  // ─── Shell references ──────────────────────────────────────────────────────
  readonly wizard = viewChild(AuthoringWizardComponent);

  // ─── SH-6 wizard: publicar producto ────────────────────────────────────────
  readonly wizardConfig: AuthoringWizardConfig = {
    heading: 'Publicar producto',
    steps: [...PUBLISH_STEPS],
    stepsLabel: 'Pasos para publicar',
    backLabel: 'Atrás',
    nextLabel: 'Continuar',
    publishLabel: 'Publicar',
    publishingLabel: 'Publicando…',
    draftScope: 'seller-publish',
  };

  /** Mirror of the wizard's persisted draft, for validity + preview. */
  readonly draft = signal<AuthoringDraft>({});

  readonly publishing = signal(false);

  readonly publishReceipt = signal<SellerPublishReceipt | null>(null);

  readonly wizardValidity = computed<Readonly<Record<string, boolean>>>(() => {
    const draft = this.draft();
    return {
      datos: this.draftString(draft, 'title').trim().length >= 3,
      media: true,
      precio: this.draftNumber(draft, 'amount') > 0 && this.draftNumber(draft, 'stock') >= 0,
      preview: true,
    };
  });

  // ─── SH-6 wiring (publicar producto) ───────────────────────────────────────
  onDraftChange(draft: AuthoringDraft): void {
    this.draft.set(draft);
  }

  async onPublish(draft: AuthoringDraft): Promise<void> {
    if (this.publishing()) {
      return;
    }
    this.publishing.set(true);
    try {
      const request: SellerPublishRequest = {
        title: this.draftString(draft, 'title').trim(),
        brand: this.draftString(draft, 'brand').trim(),
        category: this.draftString(draft, 'category').trim(),
        description: this.draftString(draft, 'description').trim(),
        condition: this.draftCondition(draft),
        images: this.draftImages(draft),
        amount: this.draftNumber(draft, 'amount'),
        currency: this.estado.currency(),
        stock: Math.max(0, Math.trunc(this.draftNumber(draft, 'stock'))),
      };
      const receipt = await this.#publicaciones.publishProduct(this.estado.apiBase(), request);
      if (!receipt) {
        // No quedó publicado (#77). Las CUATRO cosas de abajo se saltan, y cada una era
        // daño por su cuenta: la pantalla de «Publicación creada» con una referencia
        // inventada, el evento `productpublished` hacia el host con ese id fantasma, la
        // publicación fantasma en la lista del propio vendedor —que desaparece al
        // recargar— y, la peor, el borrador BORRADO: lo tecleado no se pierde (regla 18).
        this.estado.actionError.set(
          'No pudimos publicar el producto. Tu borrador sigue acá; volvé a intentarlo.',
        );
        return;
      }
      this.estado.actionError.set(null);
      this.publishReceipt.set(receipt);
      this.estado.publicado(receipt);
      // Surface the new listing in Publicaciones without waiting for the API.
      if (this.estado.cargada('publicaciones')) {
        this.estado.listings.update((list) => [
          {
            id: receipt.productId,
            title: request.title,
            sku: receipt.productId,
            amount: request.amount,
            currency: request.currency,
            stock: request.stock,
            status: request.stock > 0 ? 'activa' : 'agotada',
            questionsOpen: 0,
          },
          ...list,
        ]);
      }
      this.wizard()?.resetDraft();
      this.draft.set({});
    } finally {
      this.publishing.set(false);
    }
  }

  /** Post-publish: start a fresh listing draft. */
  publishAnother(): void {
    this.publishReceipt.set(null);
  }

  onWizardExit(): void {
    this.estado.goTo('panel');
  }

  /** Merge one field into the wizard draft (used by the step template), with the text its field emits. */
  patchField(patch: (values: AuthoringDraft) => void, key: string, value: string): void {
    patch({ [key]: value });
  }

  /** Las condiciones de una publicación, para el selector del paso de precio. */
  readonly condiciones: readonly SelectOption[] = [
    { value: 'new', label: 'Nuevo' },
    { value: 'used', label: 'Usado' },
    { value: 'refurbished', label: 'Reacondicionado' },
  ];

  // Media step: URL list handling over the opaque draft.
  readonly mediaUrl = signal('');

  addImage(patch: (values: AuthoringDraft) => void, draft: AuthoringDraft): void {
    const url = this.mediaUrl().trim();
    if (!url) {
      return;
    }
    const images = this.draftImages(draft);
    if (!images.includes(url)) {
      patch({ images: [...images, url] });
    }
    this.mediaUrl.set('');
  }

  removeImage(patch: (values: AuthoringDraft) => void, draft: AuthoringDraft, url: string): void {
    patch({ images: this.draftImages(draft).filter((entry) => entry !== url) });
  }

  draftString(draft: AuthoringDraft, key: string): string {
    const value = draft[key];
    return typeof value === 'string' ? value : '';
  }

  draftNumber(draft: AuthoringDraft, key: string): number {
    const value = draft[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  draftImages(draft: AuthoringDraft): readonly string[] {
    const value = draft['images'];
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : [];
  }

  draftCondition(draft: AuthoringDraft): 'new' | 'used' | 'refurbished' {
    const value = this.draftString(draft, 'condition');
    return value === 'used' || value === 'refurbished' ? value : 'new';
  }

  conditionLabel(condition: 'new' | 'used' | 'refurbished'): string {
    return condition === 'used'
      ? 'Usado'
      : condition === 'refurbished'
        ? 'Reacondicionado'
        : 'Nuevo';
  }

  draftPriceLabel(draft: AuthoringDraft): string {
    return this.presentacion.formatPrice(this.draftNumber(draft, 'amount'), this.estado.currency());
  }
}
