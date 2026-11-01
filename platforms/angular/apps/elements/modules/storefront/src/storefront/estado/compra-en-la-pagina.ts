import { computed, ElementRef, inject, Injectable, signal } from '@angular/core';
import {
  abrirCompraDeTienda,
  AvisosDeLaTienda,
  type BusDeLaTienda,
  cancelarCompraDeTienda,
  CarritoDeLaTienda,
  CODIGO_COBRO_DEVUELTO,
  CODIGO_COMPRA_SIN_RESOLVER,
  CODIGO_DEMASIADOS_CODIGOS,
  CODIGO_SIN_SABER,
  CompraApi,
  compraDeLaSesion,
  CompraDeLaTienda,
  type CompraPendienteDelServidor,
  ConfiguracionDeLaTienda,
  cuerpoDeLaCompra,
  cuponDeLaSesion,
  direccionDeEnvio,
  FLUJO_DE_LA_COMPRA,
  llaveRetenida,
  PedidosDeLaTienda,
  sinCompraPendiente,
} from '@synergos/dominio/tienda';
import { LiveAnnouncerService } from '@synergos/shared';
import { AVISOS_DE_UN_COBRO, type CheckoutWizardConfig, type CheckoutWizardResult } from '@synergos/shells';
import { SessionStore, TransactionEventBusService } from '@synergos/transaction-engine';
import { AVISOS_GENERADOS, clasificarRechazo, t } from '@synergos/vitals-core';
import { NavegacionDeLaTienda } from './navegacion';
/** La consulta de la página sin el parámetro de la compra. */
export function consultaSinLaCompra(): string {
  const consulta = new URLSearchParams(window.location.search);
  consulta.delete(PARAMETRO_DE_LA_COMPRA);
  const texto = consulta.toString();
  return texto ? `?${texto}` : '';
}

/**
 * El parámetro del enlace del aviso de una compra por la puerta (`?compra={id}`): lo GENERA N3 desde
 * `Synergos:Puerta:Flujos:tienda.compra:Aviso:Ruta` del CMS (`AVISOS_GENERADOS`), así que un cambio allá
 * rompe la compilación acá; la tabla escrita a mano no hace falta tocarla.
 */
export const PARAMETRO_DE_LA_COMPRA = AVISOS_GENERADOS[FLUJO_DE_LA_COMPRA].parametro;

/** La compra que trae el enlace del aviso, si la trae: de la CONSULTA, nunca del hash. */
export function compraDelEnlace(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return new URLSearchParams(window.location.search).get(PARAMETRO_DE_LA_COMPRA)?.trim() ?? '';
}

/**
 * Saca la compra del enlace de la URL una vez leída (`history.replaceState`): recargar no vuelve a abrirla,
 * y la página no queda diciendo «¡compra confirmada!» en cada F5.
 */
export function olvidarLaCompraDelEnlace(): void {
  if (typeof window === 'undefined' || !new URLSearchParams(window.location.search).has(PARAMETRO_DE_LA_COMPRA)) {
    return;
  }
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${consultaSinLaCompra()}${window.location.hash}`);
}

/** La clase de un motivo de la estrategia (sólo hay su `code`). */
function claseDelMotivo(motivo: string): ReturnType<typeof clasificarRechazo> {
  return clasificarRechazo({ code: motivo, status: 0, transient: false, detail: '', origen: 'servidor', extra: {} });
}

/**
 * La compra en esta página (014-despiece-tienda, T010): el pago con el asistente, la compra por la puerta que quedó sin
 * terminar y la que trae el enlace del aviso. Dice lo que pasa con el diccionario de la tienda (`t()`), así que vive en
 * la app y no en la lib.
 */
@Injectable()
export class CompraEnLaPagina {
  readonly #compraApi = inject(CompraApi);
  readonly #store = inject(SessionStore);
  /** El `<synergos-storefront>` de ESTA compra: desde él se encuentra, por ancestro, su `<synergos-flujo>`. */
  readonly #host: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement;
  readonly #announcer = inject(LiveAnnouncerService);
  readonly #bus = inject<TransactionEventBusService<BusDeLaTienda>>(TransactionEventBusService);
  readonly #avisos = inject(AvisosDeLaTienda);
  readonly #carrito = inject(CarritoDeLaTienda);
  readonly #compra = inject(CompraDeLaTienda);
  readonly #configuracion = inject(ConfiguracionDeLaTienda);
  readonly #navegacion = inject(NavegacionDeLaTienda);
  readonly #pedidos = inject(PedidosDeLaTienda);

  #conexion: { alConfirmar(pedido: { orderRef: string; orderNumber: string }): void } | null = null;

  /** El elemento se conecta al construirse: emite `orderconfirmed` cuando el pago termina. */
  conectar(conexion: { alConfirmar(pedido: { orderRef: string; orderNumber: string }): void }): void {
    this.#conexion = conexion;
  }

  /** El enlace del aviso de una compra por la puerta (`?compra={id}`): se lee UNA vez y sale de la URL. */
  leerElEnlace(): void {
    this.#compraDelEnlace = compraDelEnlace();
    olvidarLaCompraDelEnlace();
  }

  /** Abre la compra que trajo el enlace, si trajo una. */
  abrirElEnlace(): void {
    if (this.#compraDelEnlace) {
      void this.abrirCompraDelEnlace(this.#compraDelEnlace);
    }
  }

  // ─── La compra por la puerta: el enlace, la pendiente (004-tienda-compra) ────────
  /** La compra que trajo el enlace del aviso, leída una vez en `ngOnInit`. */
  #compraDelEnlace = '';

  /** Lo que se dice de la compra del enlace cuando no se puede mostrar (sin sesión, ajena, en curso). */
  readonly avisoDelEnlace = signal('');

  /** Si el aviso del enlace es por la sesión: entonces lleva el enlace para entrar. */
  readonly enlacePideSesion = signal(false);

  /**
   * Abre la compra del enlace: su orden, como la registra el CMS, en la confirmación. Sin sesión pide entrar
   * «para ver tu compra» (y el login vuelve con el enlace); una ajena o que no existe es «no la encontramos»;
   * una que todavía corre lo dice, sin afirmar nada.
   */
  async abrirCompraDelEnlace(id: string): Promise<void> {
    if (!this.#compra.isAuthenticated()) {
      this.enlacePideSesion.set(true);
      this.avisoDelEnlace.set(t('Storefront.Purchase.LinkSignIn', 'Inicia sesión para ver tu compra.'));
      return;
    }
    const r = await this.#compraApi.compraDeLaPuerta(this.#configuracion.apiBase(), id);
    if (!r.ok) {
      const clase = claseDelMotivo(r.rechazo.code);
      this.enlacePideSesion.set(clase === 'sesion');
      this.avisoDelEnlace.set(
        clase === 'sesion'
          ? t('Storefront.Purchase.LinkSignIn', 'Inicia sesión para ver tu compra.')
          : r.rechazo.code === 'tienda.purchase_not_found'
            ? t('Storefront.Purchase.NotFound', 'No encontramos esta compra en tu cuenta.')
            : r.rechazo.code === 'tienda.compra_en_curso'
              ? t('Storefront.Purchase.InProgress', 'Tu compra todavía se está procesando. Inténtalo de nuevo en unos segundos.')
              : t('Storefront.Purchase.Retry', 'No pudimos completar este paso. Intenta de nuevo.'),
      );
      return;
    }
    const orden = r.valor;
    if (orden.status.toLowerCase() !== 'paid') {
      // Una compra pendiente o deshecha no tiene confirmación que mostrar.
      this.avisoDelEnlace.set(
        orden.status.toLowerCase() === 'pending'
          ? t('Storefront.Purchase.InProgress', 'Tu compra todavía se está procesando. Inténtalo de nuevo en unos segundos.')
          : t('Storefront.Purchase.NotFound', 'No encontramos esta compra en tu cuenta.'),
      );
      return;
    }
    this.#compra.orderRef.set(orden.orderRef);
    this.#compra.orderNumber.set(orden.orderNumber);
    this.#compra.confirmedItems.set(orden.items.map((l) => ({ title: l.title, qty: l.qty, reference: orden.orderNumber })));
    this.#navegacion.navigate('confirmation');
  }

  /**
   * Login del CMS de vuelta a ESTA página. Método y no `computed`: el hash cambia con la navegación. Con la
   * compra del enlace sin mostrar, el login vuelve CON ella: es la que esa persona vino a ver.
   */
  loginUrl(): string {
    if (typeof window === 'undefined') {
      return '/account/login';
    }
    const consulta = new URLSearchParams(consultaSinLaCompra());
    if (this.enlacePideSesion() && this.#compraDelEnlace) {
      consulta.set(PARAMETRO_DE_LA_COMPRA, this.#compraDelEnlace);
    }
    const texto = consulta.toString();
    const aqui = `${window.location.pathname}${texto ? `?${texto}` : ''}${window.location.hash}`;
    return `/account/login?returnUrl=${encodeURIComponent(aqui)}`;
  }

  /** Las compras de la puerta del miembro sin resolver que el servidor conoce y esta sesión no. */
  readonly comprasSinResolver = signal<readonly CompraPendienteDelServidor[]>([]);

  /** Se está resolviendo una pendiente: los botones no se repiten. */
  readonly resolviendo = signal(false);

  /** Lo que dicen el aviso y sus botones, del diccionario (sección `Storefront.Purchase`). */
  readonly textosDeLaPendiente = computed(() => ({
    texto: t('Storefront.Purchase.PendingFound', 'Tienes una compra sin terminar. Termínala o cancélala antes de empezar otra.'),
    terminar: t('Storefront.Purchase.PendingResume', 'Terminar mi compra'),
    cancelar: t('Storefront.Purchase.PendingCancel', 'Cancelar esa compra'),
  }));

  /** Terminar la compra pendiente: el asistente repite lo que falta con la MISMA llave y la misma compra. */
  terminarPendiente(): void {
    this.#carrito.avisoDePendiente.set(false);
    this.#navegacion.goToCheckout();
  }

  /**
   * Cancelar la compra pendiente de esta sesión: se deshace en el orquestador —suelta lo apartado, anula el
   * pedido y el cobro autorizado— y el carrito queda libre. Si abrir nunca contestó, se recupera su saga con
   * la MISMA llave antes de cancelarla. Si resulta que sí se completó, se muestra en vez de cancelarla.
   */
  async cancelarPendiente(): Promise<void> {
    const sesion = this.#store.getValidSession();
    if (this.#carrito.compraSinTerminar() === null || this.resolviendo()) {
      return;
    }
    this.resolviendo.set(true);
    try {
      let id = compraDeLaSesion(sesion);
      const llave = llaveRetenida(sesion);
      if (!id && llave) {
        const recuperada = await abrirCompraDeTienda(
          this.#host,
          cuerpoDeLaCompra(sesion, cuponDeLaSesion(sesion.pricing)?.codigo ?? null),
          llave,
        );
        id = recuperada.ok ? recuperada.valor.id : null;
      }
      if (id && !(await this.cancelarYAsentar(id))) {
        return;
      }
      this.#store.setSession(sinCompraPendiente(this.#store.getValidSession()));
      this.#carrito.avisoDePendiente.set(false);
      this.#announcer.announce(t('Storefront.Purchase.PendingCancelled', 'Cancelamos la compra que estaba sin terminar. Ya puedes empezar otra.'));
    } finally {
      this.resolviendo.set(false);
    }
  }

  /**
   * Cancela una compra de la puerta y dice si quedó deshecha. Si cancelar no contesta con ella, la
   * CONSULTA: una completa se muestra (no se cancela lo cobrado), una que no se sabe se deja como está.
   */
  async cancelarYAsentar(id: string): Promise<boolean> {
    const cancelada = await cancelarCompraDeTienda(this.#host, id);
    if (cancelada.ok) {
      return cancelada.valor.estado === 'Compensated' || cancelada.valor.estado === 'Compensating';
    }
    if (claseDelMotivo(cancelada.rechazo.code) === 'sesion') {
      this.sesionRequerida.set(true);
      return false;
    }
    const orden = await this.#compraApi.compraDeLaPuerta(this.#configuracion.apiBase(), id);
    if (orden.ok && orden.valor.status.toLowerCase() === 'paid') {
      this.#store.setStatus('confirmed');
      this.#carrito.avisoDePendiente.set(false);
      this.#compra.orderRef.set(orden.valor.orderRef);
      this.#compra.orderNumber.set(orden.valor.orderNumber);
      this.#compra.confirmedItems.set(orden.valor.items.map((l) => ({ title: l.title, qty: l.qty, reference: orden.valor.orderNumber })));
      this.#navegacion.navigate('confirmation');
      return false;
    }
    this.#announcer.announce(t('Storefront.Purchase.Retry', 'No pudimos completar este paso. Intenta de nuevo.'), 'assertive');
    return false;
  }

  /** Las compras sin resolver que conoce el servidor (otro dispositivo, datos del sitio borrados), sin la de esta sesión. */
  async cargarComprasSinResolver(): Promise<void> {
    const r = await this.#compraApi.comprasPendientes(this.#configuracion.apiBase());
    const propia = compraDeLaSesion(this.#store.getValidSession())?.split('#')[0] ?? null;
    this.comprasSinResolver.set(r.ok ? r.valor.filter((c) => c.id.split('#')[0] !== propia) : []);
  }

  /** Cancela una compra sin resolver que conoce el servidor, y vuelve a preguntar cuáles quedan. */
  async cancelarCompraSinResolver(id: string): Promise<void> {
    if (this.resolviendo()) {
      return;
    }
    this.resolviendo.set(true);
    try {
      if (await this.cancelarYAsentar(id)) {
        this.#announcer.announce(t('Storefront.Purchase.PendingCancelled', 'Cancelamos la compra que estaba sin terminar. Ya puedes empezar otra.'));
      }
      await this.cargarComprasSinResolver();
    } finally {
      this.resolviendo.set(false);
    }
  }

  /** Un 401 de la puerta a mitad de la compra: la sesión terminó y se pide otra vez, en el mismo panel. */
  readonly sesionRequerida = signal(false);

  /** Por la puerta la compra es de miembros: sin sesión se pide ANTES de pagar, no a mitad. */
  readonly pideSesion = computed(() => this.#carrito.porLaPuerta() && (!this.#compra.isAuthenticated() || this.sesionRequerida()));

  /** Lo que dice el panel de sesión, del diccionario (sección `Storefront.Purchase`, ADR 0136). */
  readonly textosDeLaSesion = computed(() => ({
    titulo: t('Storefront.Purchase.SignInTitle', 'Inicia sesión para comprar'),
    texto: this.sesionRequerida()
      ? t('Storefront.Purchase.SessionRequired', 'Tu sesión terminó. Inicia sesión para seguir con tu compra.')
      : t('Storefront.Purchase.SignInText', 'La compra en esta tienda es para miembros. Al volver, tu carrito seguirá aquí.'),
    boton: t('Storefront.Purchase.SignIn', 'Iniciar sesión'),
  }));

  /**
   * Pasos apagables por config: datos → pago → revisar (sin paso de cita). El fallo lo dice el ASISTENTE,
   * una vez (UI#91). Por la ruta directa, con los avisos de un cobro: `pay` abre el cobro y el aviso de
   * después nombra su referencia. Por la puerta, del diccionario: abrir sólo AUTORIZA, así que «ya recibimos
   * tu pago» sería falso, y cada código que la persona puede provocar dice lo suyo (`#mensajeDeFallo`).
   */
  readonly checkoutConfig = computed<CheckoutWizardConfig>(() => ({
    steps: [
      { id: 'datos', label: 'Envío' },
      { id: 'pago', label: 'Pago' },
      { id: 'revisar', label: 'Confirmar' },
    ],
    summaryHeading: 'Tu pedido',
    submitLabel: 'Pagar y confirmar',
    ...(this.#carrito.porLaPuerta()
      ? {
          payFailedMessage: t('Storefront.Purchase.Failed', 'No pudimos completar tu compra y no se te cobró nada. Intenta de nuevo.'),
          confirmFailedMessage: t(
            'Storefront.Purchase.ConfirmPending',
            'Tu pago quedó autorizado (referencia {referencia}), pero no pudimos terminar la compra. Vuelve a intentarlo: no se te cobrará dos veces.',
          ),
          mensajeDeFallo: this.#mensajeDeFallo,
        }
      : AVISOS_DE_UN_COBRO),
    processingLabel: 'Procesando…',
    nextLabel: 'Continuar',
    backLabel: 'Atrás',
  }));

  /**
   * EL aviso de un fallo de la compra por la puerta, por el `code` que devolvió la estrategia (ADR 0136: la
   * funcionalidad traduce, con claves literales). Tienen texto propio los códigos que la persona puede
   * provocar; los demás caen al de su clase, y los que no tienen (`null`) a los avisos del asistente, que
   * nombran lo que QUEDÓ. «Te devolvimos el cobro» sólo lo dice la estrategia tras CONSULTAR la saga.
   */
  readonly #mensajeDeFallo = (motivo: string, referencia = ''): string | null => {
    switch (motivo) {
      case CODIGO_COMPRA_SIN_RESOLVER:
        void this.cargarComprasSinResolver();
        return t('Storefront.Purchase.PendingFound', 'Tienes una compra sin terminar. Termínala o cancélala antes de empezar otra.');
      case CODIGO_COBRO_DEVUELTO:
        return t('Storefront.Purchase.Refunded', 'No pudimos despachar tu pedido, así que te devolvimos el cobro.');
      case CODIGO_SIN_SABER:
        return t(
          'Storefront.Purchase.Unknown',
          'Todavía no sabemos en qué quedó tu compra (referencia {referencia}). Revisa «Mis compras» en unos minutos antes de volver a comprar.',
          { referencia },
        );
      case 'inventory.insufficient_stock':
      case 'inventory.unit_taken':
        return t('Storefront.Purchase.OutOfStock', 'No quedan unidades suficientes de uno de tus productos. Revisa tu carrito.');
      case 'pricing.price_not_found':
      case 'pricing.price_not_in_effect':
        return t('Storefront.Purchase.NotOnSale', 'Uno de tus productos ya no está a la venta. Revisa tu carrito.');
      case 'pricing.promotion_not_found':
      case 'pricing.promotion_expired':
      case 'pricing.promotion_currency_mismatch':
        // El código venció entre la vista previa y abrir: no se apartó nada, y el cupón se quita.
        this.#carrito.quitarElCupon();
        return t('Storefront.Purchase.PromoRemoved', 'El código dejó de valer y lo quitamos. Revisa el total antes de pagar.');
      case CODIGO_DEMASIADOS_CODIGOS:
        return t('Storefront.Purchase.PromoTooMany', 'Probaste demasiados códigos que no sirven. Inténtalo más tarde, o compra sin código.');
      case 'payments.payment_declined':
      case 'payments.payment_failed':
        return t('Storefront.Purchase.PaymentDeclined', 'Tu pago fue rechazado y no se te cobró nada. Puedes intentarlo con otro medio de pago.');
      default:
        break;
    }
    switch (claseDelMotivo(motivo)) {
      case 'sesion':
        this.sesionRequerida.set(true);
        return t('Storefront.Purchase.SessionRequired', 'Tu sesión terminó. Inicia sesión para seguir con tu compra.');
      case 'no_disponible':
        return t('Storefront.Purchase.Unavailable', 'La compra en línea no está disponible en este momento.');
      default:
        return null;
    }
  };

  readonly checkoutValidity = computed<Readonly<Record<string, boolean>>>(() => ({
    datos: this.#compra.shippingValid(),
    pago: true,
    // Mientras se valida un código no se paga: abrir leería la sesión SIN el cupón que se acaba de pedir.
    revisar: !this.#carrito.promoBusy(),
  }));

  readonly checkoutInstrument = computed<Readonly<Record<string, unknown>>>(() => ({
    apiBase: this.#configuracion.apiBase(),
    customer: this.#compra.checkoutCustomer(),
    provider: this.#compra.paymentMethod() === 'pse' ? 'shop-pse' : 'shop-card',
    host: this.#host,
    camino: this.#configuracion.caminoDeCompra(),
    // La dirección de «cerrar» por la puerta, con el país del despliegue; la directa la lleva en `customer`.
    direccion: direccionDeEnvio({
      direccion: this.#compra.customerAddress(),
      ciudad: this.#compra.customerCity(),
      pais: this.#configuracion.shippingCountry(),
      contacto: this.#compra.customerName(),
    }),
  }));

  onCheckoutCompleted(result: CheckoutWizardResult): void {
    this.#compra.orderRef.set(result.reference);
    const orderNumber =
      this.voucherOrderNumber(result.vouchers) || result.reference;
    this.#compra.orderNumber.set(orderNumber);
    this.#compra.confirmedItems.set(
      result.vouchers.map((voucher) => ({
        title: this.voucherTitle(voucher.detail),
        qty: this.voucherQty(voucher.detail),
        reference: voucher.reference,
      })),
    );
    // Lo comprado ya no está por comprar: el carrito queda vacío al confirmar, en los dos caminos (etapa 3). El
    // asistente sólo completa con la compra cerrada (por la puerta, `cerrar` contestó), así que no queda nada abierto.
    this.#store.reset();
    this.#pedidos.ordersLoaded.set(false);
    this.#navegacion.navigate('confirmation');
    const payload = { orderRef: result.reference, orderNumber };
    this.#conexion?.alConfirmar(payload);
    this.#bus.publish('orderconfirmed', payload);
    this.#carrito.emitCartUpdate();
  }

  // ─── Start a fresh transaction after confirmation ────────────────────────────
  startOver(): void {
    if (this.#carrito.carritoFijado()) {
      return;
    }
    this.#store.reset();
    this.#compra.orderRef.set('');
    this.#compra.orderNumber.set('');
    this.#compra.confirmedItems.set([]);
    this.#avisos.errorMessage.set('');
    this.#navegacion.navigate('plp');
    this.#carrito.emitCartUpdate();
  }

  voucherTitle(detail: Readonly<Record<string, unknown>> | undefined): string {
    const value = detail?.['title'];
    return typeof value === 'string' ? value : 'Producto';
  }

  voucherQty(detail: Readonly<Record<string, unknown>> | undefined): number {
    const value = detail?.['qty'];
    return typeof value === 'number' && Number.isFinite(value) ? value : 1;
  }

  voucherOrderNumber(
    vouchers: readonly { detail?: Readonly<Record<string, unknown>> }[],
  ): string {
    const value = vouchers[0]?.detail?.['orderNumber'];
    return typeof value === 'string' ? value : '';
  }
}
