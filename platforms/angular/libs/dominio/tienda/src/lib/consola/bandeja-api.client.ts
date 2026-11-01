import { Injectable, inject } from '@angular/core';
import { esRegistro, leerNumero, leerTexto, llamarAlBorde } from '@synergos/core';
import { LecturasDeLaConsola, type LecturaDeLaConsola } from './lecturas-de-la-consola';
import { esEtapa, legibles, readList, textoONulo } from './lectores-de-la-consola';
import { formatearImporte } from '@synergos/vitals-core';
import {
  ETAPAS_DEL_DESPACHO,
  type ActoDelDespacho,
  type BandejaDeLaTienda,
  type DestinoDelEnvio,
  type DetalleDelPedido,
  type EtapaDelDespacho,
  type EventoDelEnvio,
  type LineaDelPedido,
  type MotivoSinEnvio,
  type PedidoDeLaTienda,
  type ResultadoDelActo,
  type SellerOrderStatus,
  type VentaDelVendedor,
} from './consola.model';

/** La bandeja del personal: los pedidos de la tienda, el detalle de uno y los actos del despacho (013, T012 y T021). */
@Injectable({ providedIn: 'root' })
export class BandejaDelPersonalApi {
  readonly #lecturas = inject(LecturasDeLaConsola);

  // ─── La bandeja del personal (013-seller-operaciones, T012) ────────────────────

  /**
   * Una página de la bandeja: los pedidos pagados de la tienda entera en `etapa` (o todos), con las cuentas por etapa de
   * la tienda y las compras que el servidor no alcanzó a confirmar. Es la ruta del personal: la de «Mis compras»
   * (`orders`) es la del comprador, y la consola ya no la lee.
   */
  pedidos(apiBase: string, etapa: EtapaDelDespacho | null, pagina: number): Promise<LecturaDeLaConsola<BandejaDeLaTienda>> {
    const consulta = new URLSearchParams();
    if (etapa) consulta.set('etapa', etapa);
    consulta.set('pagina', String(Math.max(1, Math.trunc(pagina) || 1)));
    return this.#lecturas.leer(
      apiBase,
      `${apiBase}/seller/orders?${consulta.toString()}`,
      'GET /api/shop/seller/orders',
      normalizeBandeja,
      () => mockBandeja(etapa),
      (bandeja) => bandeja.pedidos.length === 0,
    );
  }

  /** El detalle de un pedido pagado, con su envío. */
  pedido(apiBase: string, orderRef: string): Promise<LecturaDeLaConsola<DetalleDelPedido>> {
    return this.#lecturas.leer(
      apiBase,
      `${apiBase}/seller/orders/${encodeURIComponent(orderRef)}`,
      'GET /api/shop/seller/orders/{orderRef}',
      normalizeDetalle,
      () => mockDetalle(orderRef),
    );
  }

  /**
   * El acto del personal sobre un pedido (013-seller-operaciones, T021): `POST seller/orders/{ref}/advance` con
   * `{ acto, guia }`. Devuelve el pedido como lo dejó el servidor, o que no se hizo (#77) con su código y la etapa en que
   * sigue: la fila no se mueve por su cuenta.
   *
   * 401 y 403 son la sesión y el permiso; un 5xx, la red o un `transient` son «no se pudo ahora»; lo demás es un rechazo
   * con su código. Un 200 que no se entiende se hizo igual: el servidor dijo que sí, y la consola vuelve a leer.
   */
  async avanzar(apiBase: string, orderRef: string, acto: ActoDelDespacho, guia?: string): Promise<ResultadoDelActo> {
    const endpoint = 'POST /api/shop/seller/orders/{orderRef}/advance';
    if (typeof fetch !== 'function' || !apiBase) {
      this.#lecturas.avisar(endpoint, new Error(apiBase ? 'fetch-unavailable' : 'sin-api'));
      return { hecho: false, por: 'caida', codigo: null, etapa: null };
    }
    const url = `${apiBase}/seller/orders/${encodeURIComponent(orderRef)}/advance`;
    let respuesta: Response;
    try {
      respuesta = await llamarAlBorde(apiBase, url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ acto, guia: guia ?? null }),
      });
    } catch (error) {
      this.#lecturas.avisar(endpoint, error);
      return { hecho: false, por: 'caida', codigo: null, etapa: null };
    }
    let cuerpo: unknown = null;
    try {
      cuerpo = await respuesta.json();
    } catch {
      cuerpo = null;
    }
    if (respuesta.ok) {
      return { hecho: true, pedido: normalizePedido(cuerpo) };
    }
    if (respuesta.status === 401 || respuesta.status === 403) {
      return { hecho: false, por: respuesta.status === 401 ? 'sin-sesion' : 'sin-permiso', codigo: null, etapa: null };
    }
    const codigo = esRegistro(cuerpo) ? textoONulo(cuerpo['code']) : null;
    const etapa = esRegistro(cuerpo) && esEtapa(cuerpo['etapa']) ? cuerpo['etapa'] : null;
    const transitorio = respuesta.status >= 500 || (esRegistro(cuerpo) && cuerpo['transient'] === true);
    if (transitorio) {
      this.#lecturas.avisar(endpoint, new Error(`HTTP ${respuesta.status}`));
    }
    return { hecho: false, por: transitorio ? 'caida' : 'rechazo', codigo, etapa };
  }

  // ─── Ventas ──────────────────────────────────────────────────────────────────

  /**
   * «Mis compras» del comprador (`GET orders`): la consola la leía como sus ventas, y el personal veía sus propias
   * compras. Desde 013-seller-operaciones T012 la consola lee la bandeja del personal ({@link pedidos}). Queda aquí sin
   * llamador y fuera de la API del cliente —desconectada, no borrada (Synergos es un superset)— hasta que el arquitecto
   * decida su retiro: está anotado en la bitácora de 013.
   */
  private orders(apiBase: string, currency: string): Promise<LecturaDeLaConsola<readonly VentaDelVendedor[]>> {
    return this.#lecturas.leer(
      apiBase,
      `${apiBase}/orders`,
      'GET /api/shop/orders',
      (data) => normalizeOrders(data, currency),
      () => mockOrders(currency),
    );
  }

  /**
   * Hace avanzar un pedido en la escalera de despacho.
   *
   * **`null` es «no se pudo», y no hay respaldo (#77).** Esto devolvía
   * `nextOrderStatus(current)` cuando el `POST` no llegaba, y su propio docstring lo
   * describía como una degradación deliberada —«degrades to a local, coherent next-status
   * when the endpoint is missing»—. El endpoint **no existe**: `ShopCatalogController`
   * declara `order/{orderRef}/tracking` como GET y nada con `/advance`, así que fallaba el
   * **100 %** de las veces y el vendedor veía su pedido pasar a «Enviado» sin que nada se
   * hubiera movido.
   *
   * Y la regla que lo caza ya estaba escrita en `CLAUDE.md` (regla 19): **un método de
   * escritura que pide como PARÁMETRO lo mismo que promete DEVOLVER deja la decisión en el
   * llamador y el servidor es decoración.** La firma era
   * `advanceShipment(apiBase, orderRef, current)` devolviendo algo derivado de `current`.
   * Por eso `current` ya no se recibe: sin él, el respaldo no se puede escribir.
   *
   * Desde 013-seller-operaciones T021 la consola da los actos por la ruta del personal ({@link avanzar}). Queda aquí sin
   * llamador y fuera de la API del cliente —desconectada, no borrada (Synergos es un superset)— hasta que el arquitecto
   * decida su retiro: está anotado en la bitácora de 013, con {@link orders}.
   */
  private async advanceShipment(apiBase: string, orderRef: string): Promise<SellerOrderStatus | null> {
    const url = `${apiBase}/order/${encodeURIComponent(orderRef)}/tracking/advance`;
    try {
      const data = await this.#lecturas.postJson(apiBase, url, { orderRef });
      const status = normalizeOrderStatus(esRegistro(data) ? data['status'] : undefined);
      if (status) {
        return status;
      }
      throw new Error('advance-shape');
    } catch (error) {
      this.#lecturas.avisar('POST /api/shop/order/{ref}/tracking/advance', error);
      return null;
    }
  }
}

const ORDER_STATUSES: readonly SellerOrderStatus[] = [
  'pending',
  'paid',
  'preparing',
  'shipped',
  'delivered',
  'cancelled',
];

function normalizeOrderStatus(value: unknown): SellerOrderStatus | null {
  const raw = leerTexto(value).trim().toLowerCase();
  return (ORDER_STATUSES as readonly string[]).includes(raw)
    ? (raw as SellerOrderStatus)
    : null;
}

/** Local forward step used only while the advance endpoint is missing. */
function normalizeOrders(value: unknown, currency: string): readonly VentaDelVendedor[] | null {
  const list = readList(value, 'orders');
  if (!list) {
    return null;
  }
  const orders = list
    .map((entry): VentaDelVendedor | null => {
      if (!esRegistro(entry)) {
        return null;
      }
      const orderNumber = leerTexto(entry['orderNumber']).trim() || leerTexto(entry['id']).trim();
      if (!orderNumber) {
        return null;
      }
      const rawLines = Array.isArray(entry['items']) ? entry['items'] : [];
      return {
        orderNumber,
        date: leerTexto(entry['date']).trim(),
        buyer:
          leerTexto(entry['buyer']).trim() || leerTexto(entry['customer']).trim(),
        status: normalizeOrderStatus(entry['status']) ?? 'paid',
        total: leerNumero(entry['total'] ?? entry['amount']),
        currency: leerTexto(entry['currency']).trim() || currency,
        items: rawLines.map((line) => ({
          title: esRegistro(line) ? leerTexto(line['title']).trim() : '',
          qty: esRegistro(line) ? Math.max(1, Math.trunc(leerNumero(line['qty']))) : 1,
          amount: esRegistro(line) ? leerNumero(line['amount']) : 0,
        })),
      };
    })
    .filter((order): order is VentaDelVendedor => order !== null);
  return legibles(list, orders);
}

/** Un pedido de la bandeja, o `null` si no se entiende: sin su referencia, su etapa o su camino no hay qué pintar. */
export function normalizePedido(value: unknown): PedidoDeLaTienda | null {
  if (!esRegistro(value)) {
    return null;
  }
  const orderRef = leerTexto(value['orderRef']).trim();
  const orderNumber = leerTexto(value['orderNumber']).trim();
  const camino = value['camino'];
  if (!orderRef || !orderNumber || !esEtapa(value['etapa']) || (camino !== 'puerta' && camino !== 'directa')) {
    return null;
  }
  const lineas = Array.isArray(value['lineas']) ? value['lineas'] : [];
  return {
    orderRef,
    orderNumber,
    fecha: leerTexto(value['fecha']).trim(),
    comprador: leerTexto(value['comprador']).trim(),
    camino,
    etapa: value['etapa'],
    total: leerNumero(value['total']),
    totalFormatted: leerTexto(value['totalFormatted']).trim(),
    moneda: leerTexto(value['moneda']).trim(),
    lineas: lineas.filter(esRegistro).map((l) => ({
      title: leerTexto(l['title']).trim(),
      qty: Math.max(1, Math.trunc(leerNumero(l['qty']))),
      amount: leerNumero(l['amount']),
      amountFormatted: leerTexto(l['amountFormatted']).trim(),
    })),
    actos: Array.isArray(value['actos']) ? value['actos'].filter((a): a is string => typeof a === 'string') : [],
    motivoSinActos: textoONulo(value['motivoSinActos']),
  };
}

/**
 * La bandeja, o `null` si su forma no se entiende. Las cuentas son de la tienda entera y van las cuatro: una que falta
 * no es un cero, es una respuesta que no se entiende (un `?? 0` afirmaría «no hay»).
 */
function normalizeBandeja(value: unknown): BandejaDeLaTienda | null {
  if (!esRegistro(value) || !Array.isArray(value['pedidos']) || !esRegistro(value['cuentas'])) {
    return null;
  }
  const cuentasCrudas = value['cuentas'];
  if (!ETAPAS_DEL_DESPACHO.every((e) => typeof cuentasCrudas[e] === 'number')) {
    return null;
  }
  const pedidos = legibles(value['pedidos'], value['pedidos'].map(normalizePedido).filter((p): p is PedidoDeLaTienda => p !== null));
  if (!pedidos) {
    return null;
  }
  return {
    pedidos,
    pagina: Math.max(1, Math.trunc(leerNumero(value['pagina']))),
    porPagina: Math.max(1, Math.trunc(leerNumero(value['porPagina']))),
    total: Math.max(0, Math.trunc(leerNumero(value['total']))),
    cuentas: {
      paid: cuentasCrudas['paid'] as number,
      preparing: cuentasCrudas['preparing'] as number,
      shipped: cuentasCrudas['shipped'] as number,
      delivered: cuentasCrudas['delivered'] as number,
    },
    sinConciliar: Math.max(0, Math.trunc(leerNumero(value['sinConciliar']))),
  };
}

function normalizeDestino(value: unknown): DestinoDelEnvio | null {
  if (!esRegistro(value)) {
    return null;
  }
  return {
    line1: textoONulo(value['line1']),
    line2: textoONulo(value['line2']),
    city: textoONulo(value['city']),
    region: textoONulo(value['region']),
    postalCode: textoONulo(value['postalCode']),
    country: textoONulo(value['country']),
    contact: textoONulo(value['contact']),
  };
}

const MOTIVOS_SIN_ENVIO: readonly MotivoSinEnvio[] = ['sin_direccion', 'sin_envio', 'envio_no_disponible'];

/** El detalle: el pedido, más su envío tal como lo dijo el servidor (o por qué no lo trae). */
function normalizeDetalle(value: unknown): DetalleDelPedido | null {
  const pedido = normalizePedido(value);
  if (!pedido || !esRegistro(value)) {
    return null;
  }
  const envio = value['envio'];
  const motivo = value['motivoSinEnvio'];
  return {
    ...pedido,
    envio: esRegistro(envio)
      ? {
          destino: normalizeDestino(envio['destino']),
          transportadora: textoONulo(envio['transportadora']),
          estado: textoONulo(envio['estado']),
          eventos: (Array.isArray(envio['eventos']) ? envio['eventos'] : []).filter(esRegistro).map(
            (e): EventoDelEnvio => ({ estado: leerTexto(e['estado']).trim(), nota: textoONulo(e['nota']), fecha: leerTexto(e['fecha']).trim() }),
          ),
        }
      : null,
    motivoSinEnvio: (MOTIVOS_SIN_ENVIO as readonly unknown[]).includes(motivo) ? (motivo as MotivoSinEnvio) : null,
  };
}

function mockOrders(currency: string): readonly VentaDelVendedor[] {
  return [
    {
      orderNumber: 'ORD-2026-00521',
      date: '2026-07-02',
      buyer: 'María G.',
      status: 'paid',
      total: 1_499_000,
      currency,
      items: [{ title: 'Audífonos Sony WH-1000XM5', qty: 1, amount: 1_499_000 }],
    },
    {
      orderNumber: 'ORD-2026-00518',
      date: '2026-07-01',
      buyer: 'Carlos R.',
      status: 'preparing',
      total: 778_000,
      currency,
      items: [{ title: 'Mouse Logitech MX Master 3S', qty: 2, amount: 389_000 }],
    },
    {
      orderNumber: 'ORD-2026-00512',
      date: '2026-06-28',
      buyer: 'Andrea P.',
      status: 'shipped',
      total: 389_000,
      currency,
      items: [{ title: 'Mouse Logitech MX Master 3S', qty: 1, amount: 389_000 }],
    },
    {
      orderNumber: 'ORD-2026-00481',
      date: '2026-06-10',
      buyer: 'Julián T.',
      status: 'delivered',
      total: 1_888_000,
      currency,
      items: [{ title: 'Audífonos Sony WH-1000XM5', qty: 1, amount: 1_499_000 }],
    },
  ];
}

/** Los pedidos de ejemplo como los pinta la bandeja: los de {@link mockOrders}, en pesos. */
export function mockPedidos(): readonly PedidoDeLaTienda[] {
  return mockOrders('COP').map((o, i): PedidoDeLaTienda => ({
    orderRef: `muestra-${o.orderNumber}`,
    orderNumber: o.orderNumber,
    fecha: `${o.date}T15:00:00Z`,
    comprador: o.buyer,
    camino: i % 2 === 0 ? 'puerta' : 'directa',
    etapa: o.status === 'preparing' || o.status === 'shipped' || o.status === 'delivered' ? o.status : 'paid',
    total: o.total,
    totalFormatted: formatearImporte(o.total, o.currency),
    moneda: o.currency,
    lineas: o.items.map((l) => ({
      title: l.title,
      qty: l.qty,
      amount: l.amount * l.qty,
      amountFormatted: formatearImporte(l.amount * l.qty, o.currency),
    })),
    actos: [],
    motivoSinActos: null,
  }));
}

function mockBandeja(etapa: EtapaDelDespacho | null): BandejaDeLaTienda {
  const todos = mockPedidos();
  const pedidos = etapa ? todos.filter((p) => p.etapa === etapa) : todos;
  const cuenta = (e: EtapaDelDespacho): number => todos.filter((p) => p.etapa === e).length;
  return {
    pedidos,
    pagina: 1,
    porPagina: 50,
    total: pedidos.length,
    cuentas: { paid: cuenta('paid'), preparing: cuenta('preparing'), shipped: cuenta('shipped'), delivered: cuenta('delivered') },
    sinConciliar: 0,
  };
}

function mockDetalle(orderRef: string): DetalleDelPedido {
  const pedido = mockPedidos().find((p) => p.orderRef === orderRef) ?? mockPedidos()[0];
  return {
    ...pedido,
    envio: {
      destino: { line1: 'Calle 93 # 11-26', line2: null, city: 'Bogotá', region: 'Cundinamarca', postalCode: null, country: 'CO', contact: pedido.comprador },
      transportadora: 'servientrega',
      estado: 'Ready',
      eventos: [{ estado: 'Ready', nota: null, fecha: pedido.fecha }],
    },
    motivoSinEnvio: null,
  };
}
