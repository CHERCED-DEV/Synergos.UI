import { Injectable, inject } from '@angular/core';
import {
  esRegistro as isRecord,
  leerNumero as readNumber,
  leerTexto as readString,
  leerTextos as readStringArray,
} from '@synergos/core';
import { BordeDeBlogs } from '../comun/borde-de-blogs';
import type { CreatorTier, StudioPayload, StudioPostStat, StudioSeriesPoint } from '../comun/blogs.model';
import { buildMockStudio } from '../comun/blogs.mock';

/** El estudio de quien escribe (012-blogs-social, I2). */
@Injectable({ providedIn: 'root' })
export class EstudioApi {
  readonly #borde: BordeDeBlogs = inject(BordeDeBlogs);

  // ─── Creator studio (SH-5 analytics + monetización) ──────────────────────────

  /**
   * `GET /api/blogs/studio` — borradores y métricas del autor de la SESIÓN. Sin `?user=`:
   * con ese parámetro se leían los ingresos y el alcance de cualquier creador.
   *
   * @throws {BlogsUnauthorizedError} si no hay sesión.
   */
  async studio(apiBase: string): Promise<StudioPayload> {
    const url = `${apiBase}/studio`;
    try {
      const data = await this.#borde.getJson(apiBase, url);
      const payload = normalizeStudio(data);
      if (payload) {
        return payload;
      }
      throw new Error('studio-shape');
    } catch (error) {
      this.#borde.rethrowIfAuthError(error);
      this.#borde.markDegraded('GET /api/blogs/studio', error);
      return buildMockStudio();
    }
  }
}

// ─── Studio normalisers ─────────────────────────────────────────────────────────

function normalizeSeries(value: unknown): readonly StudioSeriesPoint[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry): StudioSeriesPoint | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const label = readString(entry['label']).trim();
      if (!label) {
        return null;
      }
      return { label, value: readNumber(entry['value']) };
    })
    .filter((entry): entry is StudioSeriesPoint => entry !== null);
}

function normalizeTopPosts(value: unknown): readonly StudioPostStat[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry): StudioPostStat | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const postId = readString(entry['postId']).trim();
      if (!postId) {
        return null;
      }
      return {
        postId,
        excerpt: readString(entry['excerpt']).trim(),
        impressions: Math.trunc(readNumber(entry['impressions'])),
        engagements: Math.trunc(readNumber(entry['engagements'])),
        reactions: Math.trunc(readNumber(entry['reactions'])),
        comments: Math.trunc(readNumber(entry['comments'])),
      };
    })
    .filter((entry): entry is StudioPostStat => entry !== null);
}

function normalizeTiers(value: unknown): readonly CreatorTier[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry): CreatorTier | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const id = readString(entry['id']).trim();
      const name = readString(entry['name']).trim();
      if (!id || !name) {
        return null;
      }
      return {
        id,
        name,
        priceMinor: Math.trunc(readNumber(entry['priceMinor'])),
        currency: readString(entry['currency']).trim(),
        perks: readStringArray(entry['perks']),
        subscribers: Math.trunc(readNumber(entry['subscribers'])),
      };
    })
    .filter((entry): entry is CreatorTier => entry !== null);
}

function normalizeStudio(value: unknown): StudioPayload | null {
  if (!isRecord(value)) {
    return null;
  }
  // A studio payload must carry at least a followers figure to be considered valid.
  if (value['followers'] === undefined && value['reach'] === undefined) {
    return null;
  }
  return {
    followers: Math.trunc(readNumber(value['followers'])),
    followersDelta: Math.trunc(readNumber(value['followersDelta'])),
    reach: Math.trunc(readNumber(value['reach'])),
    reachDelta: Math.trunc(readNumber(value['reachDelta'])),
    engagementRate: readNumber(value['engagementRate']),
    monthlyRevenueMinor: Math.trunc(readNumber(value['monthlyRevenueMinor'])),
    currency: readString(value['currency']).trim(),
    audience: normalizeSeries(value['audience']),
    topPosts: normalizeTopPosts(value['topPosts']),
    tiers: normalizeTiers(value['tiers']),
  };
}
