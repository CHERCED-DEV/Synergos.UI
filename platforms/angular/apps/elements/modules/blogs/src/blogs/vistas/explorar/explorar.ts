import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ExplorarDeBlogs, RedDeBlogs, SeguidoresDeBlogs, type SearchTab } from '@synergos/dominio/blogs';
import { ButtonComponent } from '@synergos/shared';
import { DiscoveryShellComponent, type DiscoveryFacet, type DiscoverySortOption } from '@synergos/shells';
import { NavegacionDeBlogs } from '../../estado/navegacion';
import { PresentacionDeBlogs } from '../../estado/presentacion';
import { BlogsTarjetaComponent } from '../../piezas/tarjeta/tarjeta';
import { BlogsVerificadaComponent } from '../../piezas/verificada/verificada';

const SEARCH_SORT: readonly DiscoverySortOption[] = [
  { key: 'top', label: 'Top' },
  { key: 'recent', label: 'Recientes' },
];

const SEARCH_TABS: readonly { key: SearchTab; label: string }[] = [
  { key: 'top', label: 'Top' },
  { key: 'accounts', label: 'Cuentas' },
  { key: 'posts', label: 'Publicaciones' },
  { key: 'hashtags', label: 'Hashtags' },
];

/** Explorar (SH-1 `syn-discovery-shell`): buscar personas, publicaciones o etiquetas, y las tendencias como faceta. */
@Component({
  selector: 'sg-blogs-explorar',
  standalone: true,
  imports: [ButtonComponent, DiscoveryShellComponent, BlogsTarjetaComponent, BlogsVerificadaComponent],
  templateUrl: './explorar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'blogs__vista' },
})
export class BlogsExplorarComponent {
  protected readonly red = inject(RedDeBlogs);
  protected readonly explorar = inject(ExplorarDeBlogs);
  protected readonly seguidores = inject(SeguidoresDeBlogs);
  protected readonly navegacion = inject(NavegacionDeBlogs);
  protected readonly presentacion = inject(PresentacionDeBlogs);

  readonly searchSort = SEARCH_SORT;

  readonly searchConfig = computed(() => ({
    searchPlaceholder: 'Busca personas, publicaciones o #hashtags',
    searchButtonLabel: 'Buscar',
    filtersHeading: 'Explorar',
    clearLabel: 'Limpiar',
    sortLabel: 'Ordenar',
    layout: 'list' as const,
    emptyMessage: 'No encontramos resultados. Prueba otro término o #hashtag.',
    loadingMessage: 'Buscando…',
    resultsNoun: { one: 'publicación', many: 'publicaciones' },
    showSearch: true,
  }));

  /** SH-1 facets: the tab (top/accounts/posts/hashtags) + trending hashtags. */
  readonly discoveryFacets = computed<readonly DiscoveryFacet[]>(() => [
    {
      key: 'tab',
      // Una pestaña es una pestaña: marcar dos no tiene sentido, y el cliente ya
      // se quedaba con la primera. Declararlo pinta radios en vez de casillas (#18).
      kind: 'SingleSelect',
      label: 'Mostrar',
      values: SEARCH_TABS.map((tab) => ({ value: tab.key, label: tab.label })),
    },
    {
      key: 'hashtag',
      // La búsqueda por tendencia viaja de a una al backend.
      kind: 'SingleSelect',
      label: 'Tendencias',
      values: this.explorar.trending().map((tag) => ({
        value: tag.tag,
        label: `#${tag.tag}`,
        count: tag.postCount,
      })),
    },
  ]);
}
