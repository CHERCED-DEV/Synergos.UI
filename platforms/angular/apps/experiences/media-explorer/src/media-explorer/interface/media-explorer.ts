import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import type { ComponentTranslations } from '@synergos/contracts';
import {
  BadgeComponent,
  HeadingComponent,
  type HeadingTone,
  coerceStringRecordInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  isDirectVideoUrl,
  omitUndefinedProperties,
  resolveConfigValue,
  resolveEmbedSrc,
  resolveHeadingTone,
} from '@synergos/shared';
import { MediaState } from '../application/media.state';
import {
  selectMedia,
  activatePlayer,
  loadItems,
  filterByCategory,
} from '../application/use-cases/select-media';
import { parseMediaItems } from '../infrastructure/media-explorer.adapter';
import type { MediaExplorerConfig } from '../infrastructure/media-explorer.config';

function sanitizeMediaExplorerConfig(
  value: Partial<MediaExplorerConfig>,
): Partial<MediaExplorerConfig> {
  return omitUndefinedProperties<Partial<MediaExplorerConfig>>({
    title: coerceTrimmedStringInput(value.title),
    theme: coerceTrimmedStringInput(value.theme),
    variant: coerceTrimmedStringInput(value.variant),
    elementId: coerceTrimmedStringInput(value.elementId),
    defaultCategory: coerceTrimmedStringInput(value.defaultCategory),
    translations: coerceStringRecordInput(value.translations),
  });
}

@Component({
  selector: 'sg-media-explorer',
  imports: [BadgeComponent, HeadingComponent],
  templateUrl: './media-explorer.html',
  styleUrl: './media-explorer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-media-explorer' },
})
export class MediaExplorerComponent {
  readonly #state = new MediaState();
  readonly #sanitizer = inject(DomSanitizer);

  readonly config = input<Partial<MediaExplorerConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<MediaExplorerConfig>(sanitizeMediaExplorerConfig),
  });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly elementIdInput = input<string | undefined>(undefined, { alias: 'elementId' });
  readonly itemsInput = input<string | undefined>(undefined, { alias: 'items' });
  readonly defaultCategoryInput = input<string | undefined>(undefined, { alias: 'defaultCategory' });

  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.config()?.title, ''),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'dark'),
  );
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.config()?.variant, 'default'),
  );
  readonly elementId = computed(() =>
    resolveConfigValue(this.elementIdInput(), this.config()?.elementId, ''),
  );

  readonly items = this.#state.filteredItems;
  readonly allItems = this.#state.items;
  readonly selectedItem = this.#state.selectedItem;
  readonly selectedId = this.#state.selectedId;
  readonly isPlayerActive = this.#state.isPlayerActive;
  readonly isEmpty = this.#state.isEmpty;
  readonly categories = this.#state.availableCategories;
  readonly activeFilter = this.#state.activeFilter;
  readonly translations = computed<ComponentTranslations>(() => this.config()?.translations ?? {});

  readonly headingTone = computed<HeadingTone>(() => resolveHeadingTone(this.theme()));
  readonly hostClasses = computed(
    () => `sg-media-explorer--${this.variant()} sg-media-explorer--${this.theme()}`,
  );
  readonly filtersAriaLabel = computed(() => this.translations()['filtersAriaLabel'] ?? 'Filter media by category');
  readonly allCategoriesLabel = computed(() => this.translations()['allCategoriesLabel'] ?? 'All');
  readonly emptyStateLabel = computed(() => this.translations()['emptyStateLabel'] ?? 'No videos available.');
  readonly videoListLabel = computed(() => this.translations()['videoListLabel'] ?? 'Video list');
  readonly videoPlayerLabel = computed(() => this.translations()['videoPlayerLabel'] ?? 'Video player');
  readonly playVideoLabel = computed(() => this.translations()['playVideoLabel'] ?? 'Play');

  // eslint-disable-next-line no-unused-private-class-members
  readonly #loadEffect = effect(() => {
    const raw = this.itemsInput();
    const parsed = parseMediaItems(raw);
    if (parsed) {
      loadItems(this.#state, parsed);
      const cat = this.defaultCategoryInput() ?? this.config()?.defaultCategory;
      if (cat) filterByCategory(this.#state, cat);
    }
  });

  /**
   * Qué se puede pintar con el `videoUrl` del item seleccionado.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * ESTO EXISTE PORQUE LA PLANTILLA ATABA `[src]="current.videoUrl"` A UN
   * <iframe>, Y ESO REVENTABA EL ELEMENTO ENTERO (issue #10).
   *
   * Angular trata el `src` de un <iframe> como *resource URL context*: exige un
   * `SafeResourceUrl` y ante un string lanza NG0904 **durante la detección de
   * cambios**, así que no fallaba el vídeo — se caía el render completo.
   *
   * `videoUrl` llega del input `items`, que es un JSON que escribe el editor y
   * que el adapter parsea con un `as MediaItem[]` a pelo. O sea: texto sin
   * validar. Por eso NO vale envolverlo en `bypassSecurityTrustResourceUrl` y
   * seguir — eso apaga el error y deja pasar un `javascript:…` a un iframe con
   * `allow="clipboard-write; encrypted-media"`.
   * ─────────────────────────────────────────────────────────────────────────
   *
   * Tres destinos, y cada uno resuelve su seguridad de forma distinta:
   *
   *   `embed` → proveedor reconocido. La url se REEMITE sobre un origen
   *             literal (ver `resolveEmbedSrc`), y sólo por eso el bypass de
   *             `safeEmbedSrc` es legítimo.
   *   `file`  → fichero servido directo. Va a <video>, que para Angular es
   *             *URL context* y se sanea solo: sin bypass y sin riesgo.
   *   `none`  → no se pinta reproductor. Se cae al póster, que ya existía.
   *
   * El `none` no es un caso de error: es lo que pasa con cualquier url que no
   * sepamos embeber, y el elemento se ve bien igual.
   */
  readonly videoKind = computed<'embed' | 'file' | 'none'>(() => {
    const url = this.selectedItem()?.videoUrl ?? '';
    if (resolveEmbedSrc(url).embedSrc) return 'embed';
    if (isDirectVideoUrl(url)) return 'file';
    return 'none';
  });

  /** La url reconstruida, envuelta para poder atarla al `src` del iframe. */
  readonly safeEmbedSrc = computed<SafeResourceUrl>(() =>
    this.#sanitizer.bypassSecurityTrustResourceUrl(
      resolveEmbedSrc(this.selectedItem()?.videoUrl ?? '').embedSrc,
    ),
  );

  /**
   * La url del fichero, cruda a propósito.
   *
   * No se envuelve: Angular sanea `video[src]` por su cuenta, y envolverla
   * sería apagar justo la comprobación que acá sí queremos que corra.
   */
  readonly fileSrc = computed(() => this.selectedItem()?.videoUrl ?? '');

  select(id: string): void { selectMedia(this.#state, id); }
  play(): void { activatePlayer(this.#state); }
  filter(category: string): void { filterByCategory(this.#state, category); }
  clearFilter(): void { filterByCategory(this.#state, ''); }
  playItemLabel(title: string): string { return `${this.playVideoLabel()} ${title}`; }
}
