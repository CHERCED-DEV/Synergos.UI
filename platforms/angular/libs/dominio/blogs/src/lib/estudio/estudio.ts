import { Injectable, computed, inject, signal } from '@angular/core';
import { OrchestratorService } from '@synergos/transaction-engine';
import type { StudioPayload, StudioPostStat, StudioSection } from '../comun/blogs.model';
import { RedDeBlogs } from '../comun/red-de-blogs';
import { TEXTOS_DE_BLOGS } from '../comun/textos';
import { InicioDeBlogs } from '../contenido/inicio';
import { SUSCRIPCION_ENCENDIDA } from '../suscripcion/suscripcion';
import { EstudioApi } from './estudio-api.client';

/** The addressable sections inside the SH-5 creator studio (order = sidebar). */
export const SECCIONES_DEL_ESTUDIO: readonly StudioSection[] = SUSCRIPCION_ENCENDIDA
  ? ['overview', 'content', 'audience', 'monetization']
  : ['overview', 'content', 'audience'];

/** El estudio de quien escribe (012-blogs-social, I2): sus cifras, su contenido y su audiencia. */
@Injectable()
export class EstudioDeBlogs {
  readonly #red = inject(RedDeBlogs);
  readonly #api = inject(EstudioApi);
  readonly #inicio = inject(InicioDeBlogs);
  readonly #orchestrator = inject(OrchestratorService);
  readonly #textos = inject(TEXTOS_DE_BLOGS);

  readonly studio = signal<StudioPayload | null>(null);
  readonly studioLoaded = signal(false);
  readonly studioSection = signal<StudioSection>('overview');
  readonly studioRows = computed<readonly StudioPostStat[]>(() => this.studio()?.topPosts ?? []);
  readonly subscriberTotal = computed(() => (this.studio()?.tiers ?? []).reduce((sum, tier) => sum + tier.subscribers, 0));
  readonly audienceMax = computed(() => {
    const points = this.studio()?.audience ?? [];
    return points.reduce((max, point) => Math.max(max, point.value), 1);
  });

  constructor() {
    this.#red.alPerderLaSesion(() => {
      this.studio.set(null);
      this.studioLoaded.set(true);
    });
  }

  async loadStudio(): Promise<void> {
    this.#red.loading.set(true);
    try {
      const studio = await this.#orchestrator.callApi('studio', () => this.#api.studio(this.#red.apiBase()));
      this.studio.set(studio);
      this.studioLoaded.set(true);
      this.#red.sessionAccess.set('ok');
    } catch (error) {
      if (this.#red.handleUnauthenticated(error, this.#textos.sesionParaEstudio)) {
        return;
      }
      this.#red.errorMessage.set(this.#textos.estudioNoCargo);
      void error;
    } finally {
      this.#red.loading.set(false);
    }
  }

  onStudioSectionChange(sectionId: string): void {
    if ((SECCIONES_DEL_ESTUDIO as readonly string[]).includes(sectionId)) {
      this.studioSection.set(sectionId as StudioSection);
    }
  }

  onStudioAction(event: { readonly actionId: string; readonly row: StudioPostStat }): void {
    if (event.actionId === 'open') {
      const post = this.#inicio.posts().find((entry) => entry.id === event.row.postId);
      if (post) {
        this.#red.navegacion?.openPost(post);
        return;
      }
      this.#red.navegacion?.openPostById(event.row.postId);
    }
  }

  audiencePct(value: number): number {
    return Math.round((value / this.audienceMax()) * 100);
  }
}
