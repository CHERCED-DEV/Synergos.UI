import { Injectable, inject } from '@angular/core';
import { esRegistro, leerNumero, leerTexto } from '@synergos/core';
import { LecturasDeLaConsola, type LecturaDeLaConsola } from './lecturas-de-la-consola';
import {
  type SellerKpiMetric,
  type SellerKpiUnit,
  type SellerReputation,
  type SellerSummary,
} from './consola.model';

/** Los indicadores y la reputación del vendedor. */
@Injectable({ providedIn: 'root' })
export class ResumenDelVendedorApi {
  readonly #lecturas = inject(LecturasDeLaConsola);

  // ─── Summary (KPIs + reputación) ─────────────────────────────────────────────

  summary(apiBase: string): Promise<LecturaDeLaConsola<SellerSummary>> {
    return this.#lecturas.leer(apiBase, `${apiBase}/seller/summary`, 'GET /api/shop/seller/summary', normalizeSummary, mockSummary);
  }
}

const KPI_UNITS: readonly SellerKpiUnit[] = ['currency', 'count', 'rating', 'percent'];

function normalizeSummary(value: unknown): SellerSummary | null {
  if (!esRegistro(value) || !Array.isArray(value['kpis'])) {
    return null;
  }
  const kpis = value['kpis']
    .map((entry): SellerKpiMetric | null => {
      if (!esRegistro(entry)) {
        return null;
      }
      const id = leerTexto(entry['id']).trim();
      const label = leerTexto(entry['label']).trim();
      if (!id || !label) {
        return null;
      }
      const unitRaw = leerTexto(entry['unit']).trim().toLowerCase();
      const delta = entry['delta'] === undefined ? undefined : leerNumero(entry['delta']);
      const hint = leerTexto(entry['hint']).trim();
      return {
        id,
        label,
        value: leerNumero(entry['value']),
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
  const reputationRaw = esRegistro(value['reputation']) ? value['reputation'] : {};
  const reputation: SellerReputation = {
    score: leerNumero(reputationRaw['score']),
    level: leerTexto(reputationRaw['level']).trim(),
    onTimeRate: leerNumero(reputationRaw['onTimeRate']),
    claimRate: leerNumero(reputationRaw['claimRate']),
    responseRate: leerNumero(reputationRaw['responseRate']),
  };
  return { kpis, reputation };
}

// ─── Muestras: sólo con MUESTRAS_DE_LA_CONSOLA, y con su cartel ────────────────

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
