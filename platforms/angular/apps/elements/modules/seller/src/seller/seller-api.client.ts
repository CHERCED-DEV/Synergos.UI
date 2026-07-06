import { Injectable, inject } from '@angular/core';
import { LoggerService } from '@synergos/core';
import {
  ORDER_STATUS_LADDER,
  type SellerKpiMetric,
  type SellerKpiUnit,
  type SellerListing,
  type SellerListingStatus,
  type SellerMessage,
  type SellerOrder,
  type SellerOrderStatus,
  type SellerPublishReceipt,
  type SellerPublishRequest,
  type SellerReputation,
  type SellerReturn,
  type SellerReturnAction,
  type SellerReturnStatus,
  type SellerSummary,
  type SellerThread,
} from './seller.model';

/**
 * Thin HTTP client over the Tienda backend contract, seller side. Programs
 * against:
 *
 *  - `GET  /api/shop/seller/summary`                    → `{ kpis, reputation }`
 *  - `GET  /api/shop/orders`                            → `{ orders }` (ventas)
 *  - `POST /api/shop/order/{ref}/tracking/advance`      → `{ orderRef, status }`
 *  - `GET  /api/shop/seller/products`                   → `{ items }` (publicaciones)
 *  - `GET  /api/shop/returns`                           → `{ returns }` (RMA queue)
 *  - `POST /api/shop/return/{rmaId}/advance` `{action}` → `{ rmaId, status }`
 *  - `POST /api/shop/seller/product` `{...}`            → `{ productId, status }`
 *  - `GET  /api/shop/messages`                          → `{ threads }`
 *  - `POST /api/shop/messages/{id}/reply` `{ body }`    → `{ id, body, date }`
 *
 * **Graceful degradation** (same contract as the buyer-side `ShopApiClient`):
 * if an endpoint is not yet wired (network error / non-OK / bad shape), the
 * client falls back to visible **mock data** and logs a `TODO`, flipping the
 * `degraded` flag so the console surfaces a "datos de ejemplo" notice.
 *
 * No RxJS — native `fetch` + `Promise`, consistent with the zoneless stack.
 */
@Injectable()
export class SellerApiClient {
  readonly #logger = inject(LoggerService);

  /** Set to `true` after any mock fallback so the UI can flag example data. */
  #degraded = false;

  get degraded(): boolean {
    return this.#degraded;
  }

  // ─── Summary (KPIs + reputación) ─────────────────────────────────────────────

  async summary(apiBase: string): Promise<SellerSummary> {
    const url = `${apiBase}/seller/summary`;
    try {
      const data = await this.getJson(url);
      const summary = normalizeSummary(data);
      if (summary) {
        return summary;
      }
      throw new Error('summary-shape');
    } catch (error) {
      this.markDegraded('GET /api/shop/seller/summary', error);
      return mockSummary();
    }
  }

  // ─── Ventas ──────────────────────────────────────────────────────────────────

  async orders(apiBase: string, currency: string): Promise<readonly SellerOrder[]> {
    const url = `${apiBase}/orders`;
    try {
      const data = await this.getJson(url);
      const orders = normalizeOrders(data, currency);
      if (orders) {
        return orders;
      }
      throw new Error('orders-shape');
    } catch (error) {
      this.markDegraded('GET /api/shop/orders', error);
      return mockOrders(currency);
    }
  }

  /**
   * Move one order forward on the fulfilment ladder. The real contract only
   * ships `GET /order/{ref}/tracking` today, so the write is attempted against
   * `POST /order/{ref}/tracking/advance` and degrades to a local, coherent
   * next-status when the endpoint is missing.
   */
  async advanceShipment(
    apiBase: string,
    orderRef: string,
    current: SellerOrderStatus,
  ): Promise<SellerOrderStatus> {
    const url = `${apiBase}/order/${encodeURIComponent(orderRef)}/tracking/advance`;
    try {
      const data = await this.postJson(url, { orderRef });
      const status = normalizeOrderStatus(isRecord(data) ? data['status'] : undefined);
      if (status) {
        return status;
      }
      throw new Error('advance-shape');
    } catch (error) {
      this.markDegraded('POST /api/shop/order/{ref}/tracking/advance', error);
      return nextOrderStatus(current);
    }
  }

  // ─── Publicaciones ───────────────────────────────────────────────────────────

  async listings(apiBase: string, currency: string): Promise<readonly SellerListing[]> {
    const url = `${apiBase}/seller/products`;
    try {
      const data = await this.getJson(url);
      const listings = normalizeListings(data, currency);
      if (listings) {
        return listings;
      }
      throw new Error('listings-shape');
    } catch (error) {
      this.markDegraded('GET /api/shop/seller/products', error);
      return mockListings(currency);
    }
  }

  // ─── Devoluciones (RMA) ──────────────────────────────────────────────────────

  async returns(apiBase: string): Promise<readonly SellerReturn[]> {
    const url = `${apiBase}/returns`;
    try {
      const data = await this.getJson(url);
      const returns = normalizeReturns(data);
      if (returns) {
        return returns;
      }
      throw new Error('returns-shape');
    } catch (error) {
      this.markDegraded('GET /api/shop/returns', error);
      return mockReturns();
    }
  }

  async advanceReturn(
    apiBase: string,
    rmaId: string,
    action: SellerReturnAction,
  ): Promise<SellerReturnStatus> {
    const url = `${apiBase}/return/${encodeURIComponent(rmaId)}/advance`;
    try {
      const data = await this.postJson(url, { action });
      const status = normalizeReturnStatus(isRecord(data) ? data['status'] : undefined);
      if (status) {
        return status;
      }
      throw new Error('return-advance-shape');
    } catch (error) {
      this.markDegraded('POST /api/shop/return/{rmaId}/advance', error);
      return action === 'approve' ? 'aprobado' : 'rechazado';
    }
  }

  // ─── Publicar producto ───────────────────────────────────────────────────────

  async publishProduct(
    apiBase: string,
    request: SellerPublishRequest,
  ): Promise<SellerPublishReceipt> {
    const url = `${apiBase}/seller/product`;
    try {
      const data = await this.postJson(url, request);
      const receipt = normalizePublishReceipt(data);
      if (receipt) {
        return receipt;
      }
      throw new Error('publish-shape');
    } catch (error) {
      this.markDegraded('POST /api/shop/seller/product', error);
      return {
        productId: `PUB-${Date.now().toString(36).toUpperCase()}`,
        status: 'publicado',
      };
    }
  }

  // ─── Mensajes / preguntas ────────────────────────────────────────────────────

  async threads(apiBase: string): Promise<readonly SellerThread[]> {
    const url = `${apiBase}/messages`;
    try {
      const data = await this.getJson(url);
      const threads = normalizeThreads(data);
      if (threads) {
        return threads;
      }
      throw new Error('messages-shape');
    } catch (error) {
      this.markDegraded('GET /api/shop/messages', error);
      return mockThreads();
    }
  }

  async reply(apiBase: string, threadId: string, body: string): Promise<SellerMessage> {
    const url = `${apiBase}/messages/${encodeURIComponent(threadId)}/reply`;
    try {
      const data = await this.postJson(url, { body });
      const message = normalizeMessage(data, 'seller');
      if (message) {
        return message;
      }
      throw new Error('reply-shape');
    } catch (error) {
      this.markDegraded('POST /api/shop/messages/{id}/reply', error);
      return {
        id: `msg-${Date.now().toString(36)}`,
        from: 'seller',
        body,
        date: new Date().toISOString().slice(0, 10),
      };
    }
  }

  // ─── HTTP helpers ────────────────────────────────────────────────────────────

  private getJson(url: string): Promise<unknown> {
    return this.request(url, { method: 'GET' });
  }

  private postJson(url: string, body: unknown): Promise<unknown> {
    return this.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private request(url: string, init: RequestInit): Promise<unknown> {
    if (typeof fetch !== 'function') {
      return Promise.reject(new Error('fetch-unavailable'));
    }
    return fetch(url, {
      ...init,
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
    }).then((response) =>
      response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)),
    );
  }

  private markDegraded(endpoint: string, error: unknown): void {
    this.#degraded = true;
    // TODO(backend): remove the mock fallback once the Tienda API responds.
    this.#logger.warn(`Shop seller API "${endpoint}" unavailable — using mock data.`, error);
  }
}

// ─── Normalisers (defensive — tolerate partial/loose API shapes) ───────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function readBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }
  return fallback;
}

function readList(value: unknown, key: string): readonly unknown[] | null {
  if (Array.isArray(value)) {
    return value;
  }
  if (isRecord(value) && Array.isArray(value[key])) {
    return value[key];
  }
  return null;
}

const KPI_UNITS: readonly SellerKpiUnit[] = ['currency', 'count', 'rating', 'percent'];

function normalizeSummary(value: unknown): SellerSummary | null {
  if (!isRecord(value) || !Array.isArray(value['kpis'])) {
    return null;
  }
  const kpis = value['kpis']
    .map((entry): SellerKpiMetric | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const id = readString(entry['id']).trim();
      const label = readString(entry['label']).trim();
      if (!id || !label) {
        return null;
      }
      const unitRaw = readString(entry['unit']).trim().toLowerCase();
      const delta = entry['delta'] === undefined ? undefined : readNumber(entry['delta']);
      const hint = readString(entry['hint']).trim();
      return {
        id,
        label,
        value: readNumber(entry['value']),
        unit: (KPI_UNITS as readonly string[]).includes(unitRaw)
          ? (unitRaw as SellerKpiUnit)
          : 'count',
        delta,
        hint: hint || undefined,
      };
    })
    .filter((kpi): kpi is SellerKpiMetric => kpi !== null);
  if (kpis.length === 0) {
    return null;
  }
  const reputationRaw = isRecord(value['reputation']) ? value['reputation'] : {};
  const reputation: SellerReputation = {
    score: readNumber(reputationRaw['score']),
    level: readString(reputationRaw['level']).trim(),
    onTimeRate: readNumber(reputationRaw['onTimeRate']),
    claimRate: readNumber(reputationRaw['claimRate']),
    responseRate: readNumber(reputationRaw['responseRate']),
  };
  return { kpis, reputation };
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
  const raw = readString(value).trim().toLowerCase();
  return (ORDER_STATUSES as readonly string[]).includes(raw)
    ? (raw as SellerOrderStatus)
    : null;
}

/** Local forward step used only while the advance endpoint is missing. */
function nextOrderStatus(current: SellerOrderStatus): SellerOrderStatus {
  const index = ORDER_STATUS_LADDER.indexOf(current);
  if (index === -1) {
    return current;
  }
  return ORDER_STATUS_LADDER[Math.min(index + 1, ORDER_STATUS_LADDER.length - 1)];
}

function normalizeOrders(value: unknown, currency: string): readonly SellerOrder[] | null {
  const list = readList(value, 'orders');
  if (!list) {
    return null;
  }
  return list
    .map((entry): SellerOrder | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const orderNumber = readString(entry['orderNumber']).trim() || readString(entry['id']).trim();
      if (!orderNumber) {
        return null;
      }
      const rawLines = Array.isArray(entry['items']) ? entry['items'] : [];
      return {
        orderNumber,
        date: readString(entry['date']).trim(),
        buyer:
          readString(entry['buyer']).trim() || readString(entry['customer']).trim(),
        status: normalizeOrderStatus(entry['status']) ?? 'paid',
        total: readNumber(entry['total'] ?? entry['amount']),
        currency: readString(entry['currency']).trim() || currency,
        items: rawLines.map((line) => ({
          title: isRecord(line) ? readString(line['title']).trim() : '',
          qty: isRecord(line) ? Math.max(1, Math.trunc(readNumber(line['qty']))) : 1,
          amount: isRecord(line) ? readNumber(line['amount']) : 0,
        })),
      };
    })
    .filter((order): order is SellerOrder => order !== null);
}

const LISTING_STATUSES: readonly SellerListingStatus[] = ['activa', 'pausada', 'agotada'];

function normalizeListings(value: unknown, currency: string): readonly SellerListing[] | null {
  const list = readList(value, 'items');
  if (!list) {
    return null;
  }
  return list
    .map((entry): SellerListing | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const id = readString(entry['id']).trim() || readString(entry['sku']).trim();
      const title = readString(entry['title']).trim() || readString(entry['name']).trim();
      if (!id || !title) {
        return null;
      }
      const statusRaw = readString(entry['status']).trim().toLowerCase();
      const stock = Math.max(0, Math.trunc(readNumber(entry['stock'])));
      return {
        id,
        title,
        sku: readString(entry['sku']).trim() || id,
        amount: readNumber(entry['amount'] ?? entry['price']),
        currency: readString(entry['currency']).trim() || currency,
        stock,
        status: (LISTING_STATUSES as readonly string[]).includes(statusRaw)
          ? (statusRaw as SellerListingStatus)
          : stock > 0
            ? 'activa'
            : 'agotada',
        questionsOpen: Math.max(0, Math.trunc(readNumber(entry['questionsOpen']))),
      };
    })
    .filter((listing): listing is SellerListing => listing !== null);
}

const RETURN_STATUSES: readonly SellerReturnStatus[] = [
  'abierto',
  'en-revision',
  'aprobado',
  'rechazado',
];

function normalizeReturnStatus(value: unknown): SellerReturnStatus | null {
  const raw = readString(value).trim().toLowerCase();
  return (RETURN_STATUSES as readonly string[]).includes(raw)
    ? (raw as SellerReturnStatus)
    : null;
}

function normalizeReturns(value: unknown): readonly SellerReturn[] | null {
  const list = readList(value, 'returns');
  if (!list) {
    return null;
  }
  return list
    .map((entry): SellerReturn | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const rmaId = readString(entry['rmaId']).trim() || readString(entry['claimId']).trim();
      if (!rmaId) {
        return null;
      }
      return {
        rmaId,
        orderNumber: readString(entry['orderNumber']).trim(),
        productTitle:
          readString(entry['productTitle']).trim() || readString(entry['title']).trim(),
        reason: readString(entry['reason']).trim(),
        date: readString(entry['date']).trim(),
        status: normalizeReturnStatus(entry['status']) ?? 'abierto',
      };
    })
    .filter((rma): rma is SellerReturn => rma !== null);
}

function normalizePublishReceipt(value: unknown): SellerPublishReceipt | null {
  if (!isRecord(value)) {
    return null;
  }
  const productId = readString(value['productId']).trim() || readString(value['id']).trim();
  if (!productId) {
    return null;
  }
  return {
    productId,
    status: readString(value['status']).trim() || 'publicado',
  };
}

function normalizeMessage(value: unknown, fallbackFrom: 'buyer' | 'seller'): SellerMessage | null {
  if (!isRecord(value)) {
    return null;
  }
  const body = readString(value['body']).trim() || readString(value['text']).trim();
  if (!body) {
    return null;
  }
  const fromRaw = readString(value['from']).trim().toLowerCase();
  return {
    id: readString(value['id']).trim() || `msg-${Math.random().toString(36).slice(2, 8)}`,
    from: fromRaw === 'buyer' || fromRaw === 'seller' ? fromRaw : fallbackFrom,
    body,
    date: readString(value['date']).trim(),
  };
}

function normalizeThreads(value: unknown): readonly SellerThread[] | null {
  const list = readList(value, 'threads');
  if (!list) {
    return null;
  }
  return list
    .map((entry): SellerThread | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const id = readString(entry['id']).trim();
      const subject = readString(entry['subject']).trim();
      if (!id || !subject) {
        return null;
      }
      const rawMessages = Array.isArray(entry['messages']) ? entry['messages'] : [];
      let messages = rawMessages
        .map((message) => normalizeMessage(message, 'buyer'))
        .filter((message): message is SellerMessage => message !== null);
      // Buyer-side thread shape only carries `lastMessage` — surface it as one message.
      const lastMessage = readString(entry['lastMessage']).trim();
      if (messages.length === 0 && lastMessage) {
        messages = [
          {
            id: `${id}-last`,
            from: 'buyer',
            body: lastMessage,
            date: readString(entry['date']).trim(),
          },
        ];
      }
      return {
        id,
        subject,
        counterpart:
          readString(entry['counterpart']).trim() || readString(entry['buyer']).trim(),
        date: readString(entry['date']).trim(),
        unread: readBoolean(entry['unread']),
        messages,
      };
    })
    .filter((thread): thread is SellerThread => thread !== null);
}

// ─── Mock data (visible degradation while the backend is not yet wired) ────────

function mockSummary(): SellerSummary {
  return {
    kpis: [
      {
        id: 'ventas',
        label: 'Ventas del mes',
        value: 48_350_000,
        unit: 'currency',
        delta: 12,
        hint: 'vs. mes anterior',
      },
      { id: 'ordenes', label: 'Órdenes', value: 138, unit: 'count', delta: 8, hint: 'este mes' },
      {
        id: 'reputacion',
        label: 'Reputación',
        value: 4.8,
        unit: 'rating',
        delta: 0,
        hint: 'promedio 90 días',
      },
      {
        id: 'preguntas',
        label: 'Preguntas sin responder',
        value: 3,
        unit: 'count',
        delta: -2,
        hint: 'últimas 24 h',
      },
    ],
    reputation: {
      score: 4.8,
      level: 'Vendedor destacado',
      onTimeRate: 97,
      claimRate: 1.2,
      responseRate: 92,
    },
  };
}

function mockOrders(currency: string): readonly SellerOrder[] {
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

function mockListings(currency: string): readonly SellerListing[] {
  return [
    {
      id: 'PMOCK-1',
      title: 'Audífonos Sony WH-1000XM5',
      sku: 'SONY-XM5-BLK',
      amount: 1_499_000,
      currency,
      stock: 12,
      status: 'activa',
      questionsOpen: 2,
    },
    {
      id: 'PMOCK-3',
      title: 'Mouse Logitech MX Master 3S',
      sku: 'LOGI-MX3S',
      amount: 389_000,
      currency,
      stock: 34,
      status: 'activa',
      questionsOpen: 1,
    },
    {
      id: 'PMOCK-6',
      title: 'Parlante Sony SRS-XB23',
      sku: 'SONY-XB23',
      amount: 329_000,
      currency,
      stock: 0,
      status: 'agotada',
      questionsOpen: 0,
    },
    {
      id: 'PMOCK-9',
      title: 'Teclado mecánico compacto 65%',
      sku: 'KEYB-65',
      amount: 259_000,
      currency,
      stock: 8,
      status: 'pausada',
      questionsOpen: 0,
    },
  ];
}

function mockReturns(): readonly SellerReturn[] {
  return [
    {
      rmaId: 'RMA-2026-0043',
      orderNumber: 'ORD-2026-00481',
      productTitle: 'Audífonos Sony WH-1000XM5',
      reason: 'Producto llegó con el estuche rayado',
      date: '2026-06-30',
      status: 'abierto',
    },
    {
      rmaId: 'RMA-2026-0041',
      orderNumber: 'ORD-2026-00470',
      productTitle: 'Mouse Logitech MX Master 3S',
      reason: 'No era el color esperado',
      date: '2026-06-26',
      status: 'en-revision',
    },
    {
      rmaId: 'RMA-2026-0038',
      orderNumber: 'ORD-2026-00455',
      productTitle: 'Parlante Sony SRS-XB23',
      reason: 'Defecto de fábrica en el botón de encendido',
      date: '2026-06-20',
      status: 'aprobado',
    },
  ];
}

function mockThreads(): readonly SellerThread[] {
  return [
    {
      id: 'th-1',
      subject: 'Consulta sobre garantía · Audífonos Sony WH-1000XM5',
      counterpart: 'María G.',
      date: '2026-07-03',
      unread: true,
      messages: [
        {
          id: 'th-1-m1',
          from: 'buyer',
          body: '¿Tiene garantía oficial en Colombia?',
          date: '2026-07-03',
        },
      ],
    },
    {
      id: 'th-2',
      subject: 'Pedido ORD-2026-00512',
      counterpart: 'Andrea P.',
      date: '2026-06-29',
      unread: false,
      messages: [
        {
          id: 'th-2-m1',
          from: 'buyer',
          body: '¿Cuándo despachan mi pedido?',
          date: '2026-06-28',
        },
        {
          id: 'th-2-m2',
          from: 'seller',
          body: 'Tu pedido salió de bodega, llega mañana.',
          date: '2026-06-29',
        },
      ],
    },
    {
      id: 'th-3',
      subject: 'Pregunta · Mouse Logitech MX Master 3S',
      counterpart: 'Julián T.',
      date: '2026-06-27',
      unread: true,
      messages: [
        {
          id: 'th-3-m1',
          from: 'buyer',
          body: '¿Sirve para Mac y Windows a la vez?',
          date: '2026-06-27',
        },
      ],
    },
  ];
}
