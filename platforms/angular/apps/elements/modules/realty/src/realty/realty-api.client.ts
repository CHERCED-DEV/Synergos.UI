import { Injectable, inject } from '@angular/core';
import { LoggerService } from '@synergos/core';
import { calculateMortgage } from './mortgage.calc';
import {
  type Agent,
  type Amenity,
  type Facet,
  type GeoPoint,
  type LeadRequest,
  type LeadResult,
  type Listing,
  type ListingDetail,
  type ListingStatus,
  type MortgageRequest,
  type MortgageResult,
  type Operation,
  type PropertySpecs,
  type PropertyType,
  type SearchCriteria,
  type SearchResult,
  type Visit,
  type VisitRequest,
  type VisitSlot,
  type VisitStatus,
} from './realty.model';

/**
 * Thin HTTP client over the Propiedades backend contract (provided by the backend
 * agent in parallel). Programs against:
 *
 *  - `GET  /api/realty/listings?q=&type=&minPrice=&maxPrice=&beds=&location=` → `{ listings }`
 *  - `GET  /api/realty/listing/{id}`                                          → `{ listing, specs, gallery, location }`
 *  - `POST /api/realty/visit`    `{ listingId, slot, contact }`               → `{ visit }`
 *  - `POST /api/realty/mortgage` `{ price, downPayment, termMonths, annualRate }` → `{ monthly, totalInterest, schedule? }`
 *  - `POST /api/realty/lead`     `{ listingId, contact, message }`            → `{ leadId }`
 *
 * **Graceful degradation:** if an endpoint is not yet wired (network error / non-OK),
 * the client falls back to visible **seeded demo data** (con geo) and logs a `TODO`,
 * so the whole portal flow is complete end-to-end before the backend lands. Every
 * mock path flips the `degraded` flag so the shell can surface a "datos de ejemplo"
 * notice. The mortgage endpoint additionally falls back to the pure client-side
 * calculator (deterministic), which is the recommended source per the spec.
 *
 * No RxJS — native `fetch` + `Promise`, consistent with the zoneless stack.
 */
@Injectable()
export class RealtyApiClient {
  readonly #logger = inject(LoggerService);

  /** Set to `true` after any mock fallback so the UI can flag example data. */
  #degraded = false;

  get degraded(): boolean {
    return this.#degraded;
  }

  // ─── Listings search (faceted + geo bounds) ──────────────────────────────────

  async listings(
    apiBase: string,
    criteria: SearchCriteria,
    currency: string,
  ): Promise<SearchResult> {
    const query = this.toSearchQuery(criteria);
    const url = `${apiBase}/listings${query ? `?${query}` : ''}`;
    try {
      const data = await this.getJson(url);
      const result = normalizeSearch(data, currency);
      if (result && (result.listings.length > 0 || isRecord(data))) {
        return result;
      }
      throw new Error('listings-shape');
    } catch (error) {
      this.markDegraded('GET /api/realty/listings', error);
      return mockSearch(criteria, currency);
    }
  }

  // ─── Listing detail (PDP) ────────────────────────────────────────────────────

  async listing(apiBase: string, id: string, currency: string): Promise<ListingDetail> {
    const url = `${apiBase}/listing/${encodeURIComponent(id)}`;
    try {
      const data = await this.getJson(url);
      const detail = normalizeDetail(data, currency);
      if (detail) {
        return detail;
      }
      throw new Error('listing-shape');
    } catch (error) {
      this.markDegraded('GET /api/realty/listing/{id}', error);
      return mockDetail(id, currency);
    }
  }

  // ─── Schedule a visit (reservable agent slot — NO payment) ────────────────────

  async scheduleVisit(
    apiBase: string,
    body: VisitRequest,
    listingTitle: string,
  ): Promise<Visit> {
    const url = `${apiBase}/visit`;
    try {
      const data = await this.postJson(url, body);
      const visit = normalizeVisit(pluck(data, 'visit') ?? data, body, listingTitle);
      if (visit) {
        return visit;
      }
      throw new Error('visit-shape');
    } catch (error) {
      this.markDegraded('POST /api/realty/visit', error);
      return {
        id: `VIS-${Date.now().toString(36).toUpperCase()}`,
        listingId: body.listingId,
        listingTitle,
        slot: body.slot,
        mode: body.mode,
        status: 'confirmed',
        contact: body.contact,
      };
    }
  }

  // ─── Lead to the agent (degenerate confirm — intent, NO payment) ──────────────

  async submitLead(apiBase: string, body: LeadRequest): Promise<LeadResult> {
    const url = `${apiBase}/lead`;
    try {
      const data = await this.postJson(url, body);
      const lead = normalizeLead(pluck(data, 'lead') ?? data, body);
      if (lead) {
        return lead;
      }
      throw new Error('lead-shape');
    } catch (error) {
      this.markDegraded('POST /api/realty/lead', error);
      return {
        leadId: `LEAD-${Date.now().toString(36).toUpperCase()}`,
        listingId: body.listingId,
        status: 'new',
      };
    }
  }

  // ─── Mortgage (server seam optional; client calc is the recommended source) ───

  async mortgage(apiBase: string, body: MortgageRequest): Promise<MortgageResult> {
    const url = `${apiBase}/mortgage`;
    // Always have a deterministic client result ready as the canonical fallback.
    const clientResult = calculateMortgage(body);
    try {
      const data = await this.postJson(url, body);
      const result = normalizeMortgage(pluck(data, 'mortgage') ?? data, clientResult);
      if (result) {
        return result;
      }
      throw new Error('mortgage-shape');
    } catch (error) {
      this.markDegraded('POST /api/realty/mortgage', error);
      return clientResult;
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

  private toSearchQuery(criteria: SearchCriteria): string {
    const params = new URLSearchParams();
    if (criteria.q) {
      params.set('q', criteria.q);
    }
    params.set('operation', criteria.operation);
    if (criteria.type) {
      params.set('type', criteria.type);
    }
    if (criteria.minPrice > 0) {
      params.set('minPrice', String(criteria.minPrice));
    }
    if (criteria.maxPrice > 0) {
      params.set('maxPrice', String(criteria.maxPrice));
    }
    if (criteria.beds > 0) {
      params.set('beds', String(criteria.beds));
    }
    if (criteria.location) {
      params.set('location', criteria.location);
    }
    if (criteria.sort && criteria.sort !== 'relevance') {
      params.set('sort', criteria.sort);
    }
    if (criteria.bounds) {
      const b = criteria.bounds;
      params.set('bounds', `${b.south},${b.west},${b.north},${b.east}`);
    }
    return params.toString();
  }

  private markDegraded(endpoint: string, error: unknown): void {
    this.#degraded = true;
    // TODO(backend): remove the mock fallback once the Realty API responds.
    this.#logger.warn(`Realty API "${endpoint}" unavailable — using seeded demo data.`, error);
  }
}

// ─── Normalisers (defensive — tolerate partial/loose API shapes) ───────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pluck(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
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

function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.map(readString).filter((entry) => entry !== '') : [];
}

function readOperation(value: unknown): Operation {
  return readString(value).toLowerCase() === 'rent' ? 'rent' : 'sale';
}

function readType(value: unknown): PropertyType {
  const raw = readString(value).toLowerCase();
  const known: readonly PropertyType[] = ['apartamento', 'casa', 'lote', 'oficina', 'local'];
  return known.includes(raw as PropertyType) ? (raw as PropertyType) : 'apartamento';
}

function readStatus(value: unknown): ListingStatus {
  const raw = readString(value).toLowerCase();
  return raw === 'reserved' || raw === 'sold' ? raw : 'active';
}

function readVisitStatus(value: unknown): VisitStatus {
  const raw = readString(value).toLowerCase();
  const known: readonly VisitStatus[] = [
    'held',
    'confirmed',
    'cancelled',
    'done',
    'no-show',
  ];
  return known.includes(raw as VisitStatus) ? (raw as VisitStatus) : 'confirmed';
}

function normalizeGeo(value: unknown): GeoPoint {
  const g = isRecord(value) ? value : {};
  return {
    lat: readNumber(g['lat']),
    lng: readNumber(g['lng']),
    address: readString(g['address']).trim(),
    neighborhood: readString(g['neighborhood']).trim(),
    city: readString(g['city']).trim(),
  };
}

function normalizeSpecs(value: unknown): PropertySpecs {
  const s = isRecord(value) ? value : {};
  return {
    beds: Math.max(0, Math.trunc(readNumber(s['beds']))),
    baths: Math.max(0, Math.trunc(readNumber(s['baths']))),
    areaBuilt: readNumber(s['areaBuilt'] ?? s['area']),
    areaPrivate: readNumber(s['areaPrivate']),
    parking: Math.max(0, Math.trunc(readNumber(s['parking']))),
    stratum: Math.max(0, Math.trunc(readNumber(s['stratum']))),
    ageYears: Math.max(0, Math.trunc(readNumber(s['ageYears']))),
    floor: Math.max(0, Math.trunc(readNumber(s['floor']))),
  };
}

function normalizeListing(value: unknown, fallbackCurrency: string): Listing | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const title = readString(value['title']).trim() || readString(value['name']).trim();
  if (!id || !title) {
    return null;
  }
  return {
    id,
    title,
    subtitle: readString(value['subtitle']).trim() || readString(value['description']).trim(),
    operation: readOperation(value['operation']),
    type: readType(value['type']),
    price: readNumber(value['price'] ?? value['amount']),
    currency: readString(value['currency']).trim() || fallbackCurrency,
    geo: normalizeGeo(value['geo'] ?? value['location']),
    specs: normalizeSpecs(value['specs']),
    status: readStatus(value['status']),
    featured: readBoolean(value['featured']),
    publishedAt: readString(value['publishedAt']).trim(),
    cover: readString(value['cover']).trim() || readStringArray(value['gallery'])[0] || '',
    badges: readStringArray(value['badges']),
  };
}

function normalizeFacets(value: unknown): readonly Facet[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry): Facet | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const key = readString(entry['key']).trim();
      if (!key) {
        return null;
      }
      const rawValues = Array.isArray(entry['values']) ? entry['values'] : [];
      return {
        key,
        label: readString(entry['label']).trim() || key,
        values: rawValues
          .map((facetValue) => {
            if (!isRecord(facetValue)) {
              return null;
            }
            const facetRaw = readString(facetValue['value']).trim();
            if (!facetRaw) {
              return null;
            }
            return {
              value: facetRaw,
              label: readString(facetValue['label']).trim() || facetRaw,
              count: Math.trunc(readNumber(facetValue['count'])),
            };
          })
          .filter((facetValue): facetValue is Facet['values'][number] => facetValue !== null),
      };
    })
    .filter((facet): facet is Facet => facet !== null);
}

function normalizeSearch(value: unknown, fallbackCurrency: string): SearchResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const rawListings = Array.isArray(value['listings'])
    ? value['listings']
    : Array.isArray(value['items'])
      ? value['items']
      : [];
  const listings = rawListings
    .map((entry) => normalizeListing(entry, fallbackCurrency))
    .filter((listing): listing is Listing => listing !== null);
  return {
    listings,
    facets: normalizeFacets(value['facets']),
    total: Math.trunc(readNumber(value['total'])) || listings.length,
  };
}

function normalizeAmenities(value: unknown): readonly Amenity[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry): Amenity | null => {
      if (typeof entry === 'string') {
        const label = entry.trim();
        return label ? { key: label.toLowerCase(), label } : null;
      }
      if (!isRecord(entry)) {
        return null;
      }
      const label = readString(entry['label']).trim();
      if (!label) {
        return null;
      }
      return { key: readString(entry['key']).trim() || label.toLowerCase(), label };
    })
    .filter((amenity): amenity is Amenity => amenity !== null);
}

function normalizeAgent(value: unknown): Agent {
  const a = isRecord(value) ? value : {};
  return {
    id: readString(a['id']).trim() || 'agent',
    name: readString(a['name']).trim() || 'Asesor inmobiliario',
    agency: readString(a['agency']).trim(),
    phone: readString(a['phone']).trim(),
    email: readString(a['email']).trim(),
    photo: readString(a['photo']).trim(),
    rating: readNumber(a['rating']),
    listingsCount: Math.max(0, Math.trunc(readNumber(a['listingsCount']))),
  };
}

function normalizeDetail(value: unknown, fallbackCurrency: string): ListingDetail | null {
  if (!isRecord(value)) {
    return null;
  }
  const listing = normalizeListing(value['listing'] ?? value, fallbackCurrency);
  if (!listing) {
    return null;
  }
  const specs = normalizeSpecs(value['specs'] ?? listing.specs);
  return {
    listing: { ...listing, specs },
    description: readString(value['description']).trim() || listing.subtitle,
    specs,
    amenities: normalizeAmenities(value['amenities']),
    gallery: readStringArray(value['gallery']),
    location: normalizeGeo(value['location'] ?? listing.geo),
    agent: normalizeAgent(value['agent']),
  };
}

function normalizeVisit(
  value: unknown,
  request: VisitRequest,
  listingTitle: string,
): Visit | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  if (!id) {
    return null;
  }
  const slot = isRecord(value['slot']) ? value['slot'] : {};
  const visitSlot: VisitSlot = {
    date: readString(slot['date']).trim() || request.slot.date,
    time: readString(slot['time']).trim() || request.slot.time,
  };
  return {
    id,
    listingId: readString(value['listingId']).trim() || request.listingId,
    listingTitle: readString(value['listingTitle']).trim() || listingTitle,
    slot: visitSlot,
    mode: readString(value['mode']).trim() === 'video' ? 'video' : request.mode,
    status: readVisitStatus(value['status']),
    contact: request.contact,
  };
}

function normalizeLead(value: unknown, request: LeadRequest): LeadResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const leadId = readString(value['leadId']).trim() || readString(value['id']).trim();
  if (!leadId) {
    return null;
  }
  return {
    leadId,
    listingId: readString(value['listingId']).trim() || request.listingId,
    status: readString(value['status']).trim() || 'new',
  };
}

function normalizeMortgage(value: unknown, fallback: MortgageResult): MortgageResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const monthly = readNumber(value['monthly']);
  if (monthly <= 0) {
    return null;
  }
  const rawSchedule = Array.isArray(value['schedule']) ? value['schedule'] : [];
  const schedule = rawSchedule
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }
      return {
        period: Math.trunc(readNumber(entry['period'])),
        payment: readNumber(entry['payment']),
        principal: readNumber(entry['principal']),
        interest: readNumber(entry['interest']),
        balance: readNumber(entry['balance']),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
  return {
    monthly,
    totalInterest: readNumber(value['totalInterest']),
    principal: readNumber(value['principal']) || fallback.principal,
    totalPaid: readNumber(value['totalPaid']) || fallback.totalPaid,
    schedule: schedule.length > 0 ? schedule : fallback.schedule,
  };
}

// ─── Mock data (visible degradation when the backend is not yet wired) ─────────

/** Seeded Bogotá-area listings with real geo so the map demo works offline. */
const MOCK_LISTINGS: readonly Listing[] = [
  {
    id: 'L-1',
    title: 'Apartamento en Chicó Reservado',
    subtitle: '3 hab · 2 baños · 98 m² · Estrato 6',
    operation: 'sale',
    type: 'apartamento',
    price: 850_000_000,
    currency: 'COP',
    geo: {
      lat: 4.6736,
      lng: -74.0556,
      address: 'Cra 11 #93-45',
      neighborhood: 'Chicó',
      city: 'Bogotá',
    },
    specs: {
      beds: 3,
      baths: 2,
      areaBuilt: 98,
      areaPrivate: 88,
      parking: 2,
      stratum: 6,
      ageYears: 4,
      floor: 7,
    },
    status: 'active',
    featured: true,
    publishedAt: '2026-06-20',
    cover: '',
    badges: ['Destacado', 'Estrato 6'],
  },
  {
    id: 'L-2',
    title: 'Casa campestre en La Calera',
    subtitle: '4 hab · 3 baños · 220 m² · Estrato 4',
    operation: 'sale',
    type: 'casa',
    price: 1_250_000_000,
    currency: 'COP',
    geo: {
      lat: 4.7211,
      lng: -73.9697,
      address: 'Vía La Calera Km 4',
      neighborhood: 'El Salitre',
      city: 'La Calera',
    },
    specs: {
      beds: 4,
      baths: 3,
      areaBuilt: 220,
      areaPrivate: 200,
      parking: 3,
      stratum: 4,
      ageYears: 8,
      floor: 1,
    },
    status: 'active',
    featured: false,
    publishedAt: '2026-06-12',
    cover: '',
    badges: ['Jardín'],
  },
  {
    id: 'L-3',
    title: 'Apartaestudio en Cedritos',
    subtitle: '1 hab · 1 baño · 42 m² · Estrato 4',
    operation: 'rent',
    type: 'apartamento',
    price: 2_300_000,
    currency: 'COP',
    geo: {
      lat: 4.7253,
      lng: -74.0312,
      address: 'Cl 140 #11-20',
      neighborhood: 'Cedritos',
      city: 'Bogotá',
    },
    specs: {
      beds: 1,
      baths: 1,
      areaBuilt: 42,
      areaPrivate: 40,
      parking: 1,
      stratum: 4,
      ageYears: 2,
      floor: 5,
    },
    status: 'active',
    featured: false,
    publishedAt: '2026-06-25',
    cover: '',
    badges: ['Nuevo', 'Amoblado'],
  },
  {
    id: 'L-4',
    title: 'Oficina en Centro Internacional',
    subtitle: 'Oficina · 2 baños · 130 m² · Estrato 5',
    operation: 'rent',
    type: 'oficina',
    price: 6_500_000,
    currency: 'COP',
    geo: {
      lat: 4.6182,
      lng: -74.0705,
      address: 'Cra 7 #26-20',
      neighborhood: 'Centro Internacional',
      city: 'Bogotá',
    },
    specs: {
      beds: 0,
      baths: 2,
      areaBuilt: 130,
      areaPrivate: 130,
      parking: 2,
      stratum: 5,
      ageYears: 15,
      floor: 12,
    },
    status: 'active',
    featured: true,
    publishedAt: '2026-06-08',
    cover: '',
    badges: ['Vista panorámica'],
  },
  {
    id: 'L-5',
    title: 'Casa en Niza con rebaja',
    subtitle: '5 hab · 4 baños · 280 m² · Estrato 5',
    operation: 'sale',
    type: 'casa',
    price: 1_490_000_000,
    currency: 'COP',
    geo: {
      lat: 4.7039,
      lng: -74.0728,
      address: 'Cl 127 #58-30',
      neighborhood: 'Niza',
      city: 'Bogotá',
    },
    specs: {
      beds: 5,
      baths: 4,
      areaBuilt: 280,
      areaPrivate: 250,
      parking: 3,
      stratum: 5,
      ageYears: 20,
      floor: 1,
    },
    status: 'reserved',
    featured: false,
    publishedAt: '2026-05-30',
    cover: '',
    badges: ['Rebajado', 'Reservado'],
  },
  {
    id: 'L-6',
    title: 'Local comercial en Zona T',
    subtitle: 'Local · 1 baño · 65 m² · Estrato 6',
    operation: 'rent',
    type: 'local',
    price: 9_800_000,
    currency: 'COP',
    geo: {
      lat: 4.6671,
      lng: -74.0533,
      address: 'Cl 82 #12-18',
      neighborhood: 'Zona T',
      city: 'Bogotá',
    },
    specs: {
      beds: 0,
      baths: 1,
      areaBuilt: 65,
      areaPrivate: 65,
      parking: 0,
      stratum: 6,
      ageYears: 10,
      floor: 1,
    },
    status: 'active',
    featured: false,
    publishedAt: '2026-06-18',
    cover: '',
    badges: ['Alto tráfico'],
  },
  {
    id: 'L-7',
    title: 'Lote urbanizable en Suba',
    subtitle: 'Lote · 600 m² · Estrato 3',
    operation: 'sale',
    type: 'lote',
    price: 480_000_000,
    currency: 'COP',
    geo: {
      lat: 4.7569,
      lng: -74.0836,
      address: 'Cl 145 #90-10',
      neighborhood: 'Suba',
      city: 'Bogotá',
    },
    specs: {
      beds: 0,
      baths: 0,
      areaBuilt: 0,
      areaPrivate: 600,
      parking: 0,
      stratum: 3,
      ageYears: 0,
      floor: 0,
    },
    status: 'active',
    featured: false,
    publishedAt: '2026-06-02',
    cover: '',
    badges: ['Inversión'],
  },
  {
    id: 'L-8',
    title: 'Apartamento nuevo en Usaquén',
    subtitle: '2 hab · 2 baños · 76 m² · Estrato 5',
    operation: 'sale',
    type: 'apartamento',
    price: 620_000_000,
    currency: 'COP',
    geo: {
      lat: 4.6951,
      lng: -74.0308,
      address: 'Cra 6 #117-40',
      neighborhood: 'Usaquén',
      city: 'Bogotá',
    },
    specs: {
      beds: 2,
      baths: 2,
      areaBuilt: 76,
      areaPrivate: 70,
      parking: 1,
      stratum: 5,
      ageYears: 1,
      floor: 9,
    },
    status: 'active',
    featured: true,
    publishedAt: '2026-06-26',
    cover: '',
    badges: ['Nuevo', 'Sobre planos'],
  },
];

function mockSearch(criteria: SearchCriteria, currency: string): SearchResult {
  const all = MOCK_LISTINGS.map((listing) => ({ ...listing, currency }));
  const term = criteria.q.trim().toLowerCase();
  const location = criteria.location.trim().toLowerCase();

  let listings = all.filter((listing) => listing.operation === criteria.operation);

  if (term) {
    listings = listings.filter(
      (listing) =>
        listing.title.toLowerCase().includes(term) ||
        listing.geo.neighborhood.toLowerCase().includes(term) ||
        listing.geo.city.toLowerCase().includes(term),
    );
  }
  if (location) {
    listings = listings.filter(
      (listing) =>
        listing.geo.neighborhood.toLowerCase().includes(location) ||
        listing.geo.city.toLowerCase().includes(location),
    );
  }
  if (criteria.type) {
    listings = listings.filter((listing) => listing.type === criteria.type);
  }
  if (criteria.beds > 0) {
    listings = listings.filter((listing) => listing.specs.beds >= criteria.beds);
  }
  if (criteria.minPrice > 0) {
    listings = listings.filter((listing) => listing.price >= criteria.minPrice);
  }
  if (criteria.maxPrice > 0) {
    listings = listings.filter((listing) => listing.price <= criteria.maxPrice);
  }
  if (criteria.bounds) {
    const b = criteria.bounds;
    listings = listings.filter(
      (listing) =>
        listing.geo.lat <= b.north &&
        listing.geo.lat >= b.south &&
        listing.geo.lng <= b.east &&
        listing.geo.lng >= b.west,
    );
  }

  listings = sortMock(listings, criteria.sort);
  return { listings, facets: mockFacets(all, criteria.operation), total: listings.length };
}

function sortMock(listings: readonly Listing[], sort: SearchCriteria['sort']): Listing[] {
  const copy = [...listings];
  switch (sort) {
    case 'price-asc':
      return copy.sort((a, b) => a.price - b.price);
    case 'price-desc':
      return copy.sort((a, b) => b.price - a.price);
    case 'newest':
      return copy.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    case 'area-desc':
      return copy.sort((a, b) => b.specs.areaBuilt - a.specs.areaBuilt);
    default:
      return copy.sort((a, b) => Number(b.featured) - Number(a.featured));
  }
}

function mockFacets(listings: readonly Listing[], operation: Operation): readonly Facet[] {
  const scoped = listings.filter((listing) => listing.operation === operation);
  const count = (predicate: (listing: Listing) => boolean): number =>
    scoped.filter(predicate).length;
  const types: readonly { value: PropertyType; label: string }[] = [
    { value: 'apartamento', label: 'Apartamento' },
    { value: 'casa', label: 'Casa' },
    { value: 'oficina', label: 'Oficina' },
    { value: 'local', label: 'Local' },
    { value: 'lote', label: 'Lote' },
  ];
  return [
    {
      key: 'type',
      label: 'Tipo',
      values: types.map((type) => ({
        value: type.value,
        label: type.label,
        count: count((listing) => listing.type === type.value),
      })),
    },
    {
      key: 'beds',
      label: 'Habitaciones',
      values: [1, 2, 3, 4].map((beds) => ({
        value: String(beds),
        label: beds === 4 ? '4+' : `${beds}+`,
        count: count((listing) => listing.specs.beds >= beds),
      })),
    },
    {
      key: 'stratum',
      label: 'Estrato',
      values: [3, 4, 5, 6].map((stratum) => ({
        value: String(stratum),
        label: `Estrato ${stratum}`,
        count: count((listing) => listing.specs.stratum === stratum),
      })),
    },
  ];
}

function mockDetail(id: string, currency: string): ListingDetail {
  const listing =
    MOCK_LISTINGS.map((entry) => ({ ...entry, currency })).find((entry) => entry.id === id) ??
    { ...MOCK_LISTINGS[0], currency };
  const agent: Agent = {
    id: 'A-1',
    name: 'Daniela Ospina',
    agency: 'Synergos Inmobiliaria',
    phone: '+57 300 555 0123',
    email: 'daniela.ospina@synergos.co',
    photo: '',
    rating: 4.8,
    listingsCount: 24,
  };
  return {
    listing,
    description:
      'Inmueble de demostración. La descripción real, las fotos de alta resolución y ' +
      'la ubicación exacta se cargan desde el catálogo del CMS cuando el motor de ' +
      'propiedades responde. Este espacio muestra el flujo completo del portal: ' +
      'galería, especificaciones, mapa, calculadora de hipoteca y agendamiento de visita.',
    specs: listing.specs,
    amenities: [
      { key: 'gym', label: 'Gimnasio' },
      { key: 'pool', label: 'Piscina' },
      { key: 'bbq', label: 'Zona BBQ' },
      { key: 'security', label: 'Portería 24h' },
      { key: 'elevator', label: 'Ascensor' },
      { key: 'pet', label: 'Pet friendly' },
    ],
    gallery: [],
    location: listing.geo,
    agent,
  };
}
