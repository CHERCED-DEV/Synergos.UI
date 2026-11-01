import { Injectable, inject } from '@angular/core';
import { esRegistro, leerNumero, leerTexto } from '@synergos/core';
import { LecturasDeLaConsola, type LecturaDeLaConsola } from './lecturas-de-la-consola';
import { legibles, readList } from './lectores-de-la-consola';
import {
  type SellerListing,
  type SellerListingStatus,
  type SellerPublishReceipt,
  type SellerPublishRequest,
} from './consola.model';

/** Las publicaciones del vendedor y publicar una nueva (SH-6). */
@Injectable({ providedIn: 'root' })
export class PublicacionesDelVendedorApi {
  readonly #lecturas = inject(LecturasDeLaConsola);

  // ─── Publicaciones ───────────────────────────────────────────────────────────

  listings(apiBase: string, currency: string): Promise<LecturaDeLaConsola<readonly SellerListing[]>> {
    return this.#lecturas.leer(
      apiBase,
      `${apiBase}/seller/products`,
      'GET /api/shop/seller/products',
      (data) => normalizeListings(data, currency),
      () => mockListings(currency),
    );
  }

  // ─── Publicar producto ───────────────────────────────────────────────────────

  /**
   * Publica un producto.
   *
   * **`null` es «no quedó publicado», y es el arreglo del peor de los tres (#77).** Esto
   * devolvía `{ productId: 'PUB-<timestamp36>', status: 'publicado' }` cuando el `POST` no
   * llegaba. Y no llegaba nunca: `ShopCatalogController` **no declara `seller/product`**, así
   * que el vendedor llenaba el formulario, pulsaba publicar, y la pantalla le decía
   * «Publicación creada» con una referencia que no existe en ninguna parte — mientras el
   * componente emitía el evento `productpublished` hacia el host, metía la publicación
   * fantasma en su propia lista y **le borraba el borrador**.
   *
   * Es el quinto de la familia que `CLAUDE.md` ya tiene documentada cuatro veces: el
   * `claimId` de la devolución (regla 9), el `CERT-<random>` (14), el `CITA-<timestamp>` (18)
   * y el `MOCK-<ts>`/`ENR-` (21). Un identificador cuyo valor entero es ser cierto no se
   * rellena: sin dato, se dice que no hay dato.
   */
  async publishProduct(
    apiBase: string,
    request: SellerPublishRequest,
  ): Promise<SellerPublishReceipt | null> {
    const url = `${apiBase}/seller/product`;
    try {
      const data = await this.#lecturas.postJson(apiBase, url, request);
      const receipt = normalizePublishReceipt(data);
      if (receipt) {
        return receipt;
      }
      throw new Error('publish-shape');
    } catch (error) {
      this.#lecturas.avisar('POST /api/shop/seller/product', error);
      return null;
    }
  }
}

const LISTING_STATUSES: readonly SellerListingStatus[] = ['activa', 'pausada', 'agotada'];

function normalizeListings(value: unknown, currency: string): readonly SellerListing[] | null {
  const list = readList(value, 'items');
  if (!list) {
    return null;
  }
  const listings = list
    .map((entry): SellerListing | null => {
      if (!esRegistro(entry)) {
        return null;
      }
      const id = leerTexto(entry['id']).trim() || leerTexto(entry['sku']).trim();
      const title = leerTexto(entry['title']).trim() || leerTexto(entry['name']).trim();
      if (!id || !title) {
        return null;
      }
      const statusRaw = leerTexto(entry['status']).trim().toLowerCase();
      const stock = Math.max(0, Math.trunc(leerNumero(entry['stock'])));
      return {
        id,
        title,
        sku: leerTexto(entry['sku']).trim() || id,
        amount: leerNumero(entry['amount'] ?? entry['price']),
        currency: leerTexto(entry['currency']).trim() || currency,
        stock,
        status: (LISTING_STATUSES as readonly string[]).includes(statusRaw)
          ? (statusRaw as SellerListingStatus)
          : stock > 0
            ? 'activa'
            : 'agotada',
        questionsOpen: Math.max(0, Math.trunc(leerNumero(entry['questionsOpen']))),
      };
    })
    .filter((listing): listing is SellerListing => listing !== null);
  return legibles(list, listings);
}

function normalizePublishReceipt(value: unknown): SellerPublishReceipt | null {
  if (!esRegistro(value)) {
    return null;
  }
  const productId = leerTexto(value['productId']).trim() || leerTexto(value['id']).trim();
  if (!productId) {
    return null;
  }
  return {
    productId,
    status: leerTexto(value['status']).trim() || 'publicado',
  };
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
