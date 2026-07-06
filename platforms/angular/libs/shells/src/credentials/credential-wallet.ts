import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  type TemplateRef,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

/**
 * SH-10 v1 — `syn-credential-wallet` (catálogo §1.3 doc 21; estrenado por
 * Booking, evoluciona a v2 en Eventos con barcode rotativo).
 *
 * The reusable verifiable-credential organism: a "mis credenciales" list of
 * voucher/PNR/e-ticket cards, each with a scannable QR (embeds the published
 * `<synergos-qr-code>` custom element), a status pill and an expandable detail
 * (fields + optional templates). **Domain-free:** a hotel voucher, a flight
 * PNR, a course certificate and a government receipt are all the same card —
 * the domain feeds `WalletCredential[]` and (optionally) an `actionsTemplate`.
 */

/** Visual tone of a credential status pill. */
export type CredentialTone = 'positive' | 'neutral' | 'warning' | 'negative';

/** Status shown on the card (label already localised by the consumer). */
export interface CredentialStatus {
  readonly label: string;
  /** Default `neutral`. */
  readonly tone?: CredentialTone;
}

/** One label/value row in the expanded detail. */
export interface CredentialField {
  readonly label: string;
  readonly value: string;
}

/** One verifiable credential (voucher / PNR / e-ticket / certificado). */
export interface WalletCredential {
  readonly id: string;
  /** Small kind chip, e.g. "Vuelo" / "Hotel" / "E-ticket". */
  readonly kind?: string;
  readonly title: string;
  readonly subtitle?: string;
  /** The verifiable reference (PNR / voucher code) shown and encoded. */
  readonly reference: string;
  readonly status: CredentialStatus;
  /** Display date (already formatted by the consumer). */
  readonly issuedAt?: string;
  /** Extra rows for the expanded detail. */
  readonly fields?: readonly CredentialField[];
  /** QR payload; defaults to `reference`. */
  readonly qrData?: string;
}

/** Copy + behaviour config. Everything optional. */
export interface CredentialWalletConfig {
  readonly heading?: string;
  readonly emptyMessage?: string;
  readonly listLabel?: string;
  readonly referenceLabel?: string;
  readonly expandLabel?: string;
  readonly collapseLabel?: string;
  /** QR pixel size. Default 144. */
  readonly qrSize?: number;
}

/** Template context for the actions / extra-detail slots. */
export interface CredentialWalletContext {
  readonly $implicit: WalletCredential;
}

const DEFAULT_QR_SIZE = 144;

@Component({
  selector: 'syn-credential-wallet',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Embeds the published <synergos-qr-code> custom element.
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  host: { class: 'syn-credential-wallet' },
  styleUrl: './credential-wallet.scss',
  template: `
    <div class="syn-wallet">
      @if (config().heading) {
        <h2 class="syn-wallet__heading">{{ config().heading }}</h2>
      }

      @if (credentials().length === 0) {
        <p class="syn-wallet__empty">
          {{ config().emptyMessage || 'Todavía no tienes credenciales.' }}
        </p>
      } @else {
        <ul class="syn-wallet__list" [attr.aria-label]="config().listLabel || 'Mis credenciales'">
          @for (credential of credentials(); track credential.id) {
            <li
              class="syn-wallet__card"
              [attr.data-tone]="credential.status.tone || 'neutral'"
              [class.is-expanded]="isExpanded(credential.id)"
            >
              <div class="syn-wallet__head">
                <div class="syn-wallet__id">
                  @if (credential.kind) {
                    <span class="syn-wallet__kind">{{ credential.kind }}</span>
                  }
                  <h3 class="syn-wallet__title">{{ credential.title }}</h3>
                  @if (credential.subtitle) {
                    <p class="syn-wallet__subtitle">{{ credential.subtitle }}</p>
                  }
                </div>
                <span class="syn-wallet__status" [attr.data-tone]="credential.status.tone || 'neutral'">
                  {{ credential.status.label }}
                </span>
              </div>

              <p class="syn-wallet__ref">
                <span class="syn-wallet__ref-label">{{ config().referenceLabel || 'Código' }}</span>
                <code class="syn-wallet__ref-code">{{ credential.reference }}</code>
                @if (credential.issuedAt) {
                  <span class="syn-wallet__issued">{{ credential.issuedAt }}</span>
                }
              </p>

              <button
                type="button"
                class="syn-wallet__toggle"
                [attr.aria-expanded]="isExpanded(credential.id)"
                (click)="toggle(credential)"
              >
                {{
                  isExpanded(credential.id)
                    ? config().collapseLabel || 'Ocultar detalle'
                    : config().expandLabel || 'Ver detalle y QR'
                }}
              </button>

              @if (isExpanded(credential.id)) {
                <div class="syn-wallet__detail">
                  <div class="syn-wallet__qr">
                    <synergos-qr-code
                      [attr.data]="credential.qrData || credential.reference"
                      [attr.size]="qrSize()"
                      [attr.caption]="credential.reference"
                    ></synergos-qr-code>
                  </div>
                  <div class="syn-wallet__facts">
                    @if (credential.fields && credential.fields.length > 0) {
                      <dl class="syn-wallet__fields">
                        @for (field of credential.fields; track field.label) {
                          <div class="syn-wallet__field">
                            <dt class="syn-wallet__field-label">{{ field.label }}</dt>
                            <dd class="syn-wallet__field-value">{{ field.value }}</dd>
                          </div>
                        }
                      </dl>
                    }
                    @if (detailTemplate(); as detail) {
                      <ng-container
                        [ngTemplateOutlet]="detail"
                        [ngTemplateOutletContext]="{ $implicit: credential }"
                      />
                    }
                    @if (actionsTemplate(); as actions) {
                      <div class="syn-wallet__actions">
                        <ng-container
                          [ngTemplateOutlet]="actions"
                          [ngTemplateOutletContext]="{ $implicit: credential }"
                        />
                      </div>
                    }
                  </div>
                </div>
              }
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class CredentialWalletComponent {
  // ─── Inputs ────────────────────────────────────────────────────────────────
  readonly config = input<CredentialWalletConfig>({});
  readonly credentials = input<readonly WalletCredential[]>([]);
  /** Extra free-form detail rendered inside the expanded panel. */
  readonly detailTemplate = input<TemplateRef<CredentialWalletContext> | null>(null);
  /** Domain actions (cancelar / check-in / transferir…) for the expanded card. */
  readonly actionsTemplate = input<TemplateRef<CredentialWalletContext> | null>(null);

  // ─── Outputs ───────────────────────────────────────────────────────────────
  /** Emitted when a credential is expanded. */
  readonly credentialselect = output<WalletCredential>();

  // ─── State ─────────────────────────────────────────────────────────────────
  readonly expandedId = signal('');

  readonly qrSize = computed(() => {
    const size = this.config().qrSize;
    return typeof size === 'number' && Number.isFinite(size) && size > 0
      ? Math.round(size)
      : DEFAULT_QR_SIZE;
  });

  isExpanded(id: string): boolean {
    return this.expandedId() === id;
  }

  toggle(credential: WalletCredential): void {
    if (this.isExpanded(credential.id)) {
      this.expandedId.set('');
      return;
    }
    this.expandedId.set(credential.id);
    this.credentialselect.emit(credential);
  }
}
