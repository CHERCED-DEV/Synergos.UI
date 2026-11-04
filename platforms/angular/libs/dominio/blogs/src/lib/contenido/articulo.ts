import { Injectable, computed, inject, signal } from '@angular/core';
import { RedDeBlogs } from '../comun/red-de-blogs';
import { TEXTOS_DE_BLOGS } from '../comun/textos';
import { ContenidoApi } from './contenido-api.client';
import { InicioDeBlogs } from './inicio';

/** El mínimo del cuerpo de un artículo. */
export const MINIMO_DEL_CUERPO = 20;

/** El borrador del asistente de un artículo (SH-6): un mapa opaco de claves. */
export type BorradorDelArticulo = Readonly<Record<string, unknown>>;

/** Lo que el caso de uso necesita del asistente que pinta la app: tirar su borrador persistente. */
export interface AsistenteDelArticulo {
  resetDraft(): void;
}

/**
 * Escribir un artículo (012-blogs-social, I2): el espejo del borrador del asistente, su validez y publicarlo.
 *
 * Las cuatro señales siguen siendo la fuente de verdad de la validez, y además son el ESPEJO del borrador persistente de
 * SH-6: el asistente guarda en su propio `SessionStore` con scope y TTL de 24 h, así que un artículo a medias sobrevive
 * a recargar la página.
 */
@Injectable()
export class ArticuloDeBlogs {
  readonly #red = inject(RedDeBlogs);
  readonly #api = inject(ContenidoApi);
  readonly #inicio = inject(InicioDeBlogs);
  readonly #textos = inject(TEXTOS_DE_BLOGS);

  readonly articleTitle = signal('');
  readonly articleBody = signal('');
  readonly articleCover = signal('');
  readonly articleCoverAlt = signal('');
  readonly articleValid = computed(() => {
    const titleOk = this.articleTitle().trim().length >= 3;
    const bodyOk = this.articleBody().trim().length >= MINIMO_DEL_CUERPO;
    const coverOk = !this.articleCover().trim() || this.articleCoverAlt().trim().length > 0;
    return titleOk && bodyOk && coverOk;
  });
  /** Se pudo escribir, pero el servidor no lo aceptó. El texto sigue en su sitio. */
  readonly articleNotSaved = signal(false);

  /**
   * Validez por paso. Es `articleValid()` repartida, y las llaves tienen que coincidir con
   * los ids de los pasos del asistente: `validity` de SH-6 falla ABIERTO —una llave que no
   * cuadra se lee como válida— así que un renombre silencioso quitaría el gating sin romper nada.
   */
  readonly articleValidity = computed<Readonly<Record<string, boolean>>>(() => ({
    contenido:
      this.articleTitle().trim().length >= 3 && this.articleBody().trim().length >= MINIMO_DEL_CUERPO,
    portada: !this.articleCover().trim() || this.articleCoverAlt().trim().length > 0,
    revisar: this.articleValid(),
  }));

  /** El asistente que pinta la app, cuando existe: publicar tira su borrador ya guardado. */
  asistente: () => AsistenteDelArticulo | undefined = () => undefined;

  #articleSeeded = false;

  /**
   * Siembra el espejo desde el borrador rehidratado.
   *
   * **SH-6 NO emite `draftchange` al rehidratar** —sólo lo hace `patchDraft`—, así que sin
   * esto el espejo arrancaría vacío tras recargar: el autor vería su texto restaurado en los
   * campos y el botón de continuar MUERTO, porque `validity` se calcula del espejo.
   */
  seedArticleMirror(draft: BorradorDelArticulo | undefined): void {
    if (this.#articleSeeded) {
      return;
    }
    if (!draft || Object.keys(draft).length === 0) {
      return;
    }
    this.#articleSeeded = true;
    this.articleTitle.set(readDraftString(draft, 'title'));
    this.articleBody.set(readDraftString(draft, 'body'));
    this.articleCover.set(readDraftString(draft, 'coverUrl'));
    this.articleCoverAlt.set(readDraftString(draft, 'coverAlt'));
  }

  /** Un campo del artículo (lo que emite su átomo): escribe el espejo Y el borrador persistente. */
  onArticleField(
    patch: (values: BorradorDelArticulo) => void,
    field: 'title' | 'body' | 'coverUrl' | 'coverAlt',
    value: string,
  ): void {
    this.articleNotSaved.set(false);
    switch (field) {
      case 'title':
        this.articleTitle.set(value);
        break;
      case 'body':
        this.articleBody.set(value);
        break;
      case 'coverUrl':
        this.articleCover.set(value);
        // Quitar la portada limpia su alt. Antes se quedaba rancio: el input vive
        // dentro de un `@if` que lo OCULTA sin borrar la señal, así que el POST
        // salía con `coverAlt` y sin `coverUrl`. En SH-6 sería peor, porque
        // `patchDraft` sólo fusiona y nunca borra claves.
        if (!value.trim()) {
          this.articleCoverAlt.set('');
          patch({ coverUrl: '', coverAlt: '' });
          return;
        }
        break;
      case 'coverAlt':
        this.articleCoverAlt.set(value);
        break;
    }
    patch({ [field]: value });
  }

  /**
   * Publica el artículo, y **no da por publicado lo que el servidor no aceptó** (#26).
   *
   * La guarda de la primera línea es sincrónica a propósito —`publishing.set(true)` corre
   * en el mismo tick— así que el doble clic no publica dos veces.
   */
  publishArticle(): void {
    if (!this.articleValid() || this.#red.publishing()) {
      return;
    }
    this.#red.publishing.set(true);
    this.articleNotSaved.set(false);
    const draft = {
      title: this.articleTitle().trim(),
      body: this.articleBody().trim(),
      coverUrl: this.articleCover().trim() || undefined,
      coverAlt: this.articleCoverAlt().trim() || undefined,
    };
    this.#api
      .publishArticle(this.#red.apiBase(), draft, this.#red.autorLocal())
      .then(({ post, persisted }) => {
        if (!persisted) {
          // Nada de esto ocurre: no se mete en el feed, no se limpia el borrador y
          // no se le cuenta al CMS. Lo único que cambia es que se dice.
          this.articleNotSaved.set(true);
          return;
        }
        this.#inicio.publicado(post);
        this.articleTitle.set('');
        this.articleBody.set('');
        this.articleCover.set('');
        this.articleCoverAlt.set('');
        // El borrador persistente se tira con el artículo ya guardado, no antes.
        // `resetDraft()` no emite `draftchange`, así que el espejo se limpia acá.
        this.asistente()?.resetDraft();
        this.#articleSeeded = false;
        this.#red.navegacion?.go('feed');
        this.#red.eventos.articlepublished({ id: post.id });
        this.#red.eventos.postpublished({ id: post.id });
      })
      .catch((error: unknown) => {
        this.#red.errorMessage.set(this.#textos.articuloFallo);
        void error;
      })
      .finally(() => this.#red.publishing.set(false));
  }
}

/** Lee una clave del borrador opaco de SH-6 como cadena. */
function readDraftString(draft: BorradorDelArticulo, key: string): string {
  const value = draft[key];
  return typeof value === 'string' ? value : '';
}
