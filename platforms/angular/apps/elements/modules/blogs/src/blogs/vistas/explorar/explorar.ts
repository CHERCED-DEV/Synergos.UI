import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ExplorarDeBlogs, RedDeBlogs, SeguidoresDeBlogs, type SearchTab } from '@synergos/dominio/blogs';
import { ButtonComponent } from '@synergos/shared';
import { DiscoveryShellComponent, type DiscoveryFacet, type DiscoverySortOption } from '@synergos/shells';
import { NavegacionDeBlogs } from '../../estado/navegacion';
import { PresentacionDeBlogs } from '../../estado/presentacion';
import { BlogsTarjetaComponent } from '../../piezas/tarjeta/tarjeta';
import { BlogsVerificadaComponent } from '../../piezas/verificada/verificada';
import { textosDeLaRed } from '../../textos-de-la-red';

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

/**
 * Explorar (SH-1 `syn-discovery-shell`): buscar personas, publicaciones o etiquetas, y las tendencias como faceta.
 *
 * En la página de una etiqueta (012-blogs-social, I6, «#arquitectura») la etiqueta es fija: todo lo que se busca va
 * dentro de ella, las tendencias no se ofrecen y el título es el que compone el editor, o la etiqueta.
 */
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
  protected readonly textosRed = textosDeLaRed();

  readonly searchSort = SEARCH_SORT;

  /** El título que compone el editor en el bloque; vacío, el de la etiqueta fija o «Explorar». */
  readonly heading = input('');

  readonly subheading = input('');

  /** El título de la página: el del editor, o `#etiqueta` si la página la fija; vacío, la plantilla dice «Explorar». */
  readonly titulo = computed(() => {
    const etiqueta = this.explorar.etiquetaFija();
    return this.heading() || (etiqueta ? `#${etiqueta}` : '');
  });

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

  /**
   * SH-1 facets: the tab (top/accounts/posts/hashtags) + trending hashtags. Con la etiqueta fija (I6) las tendencias
   * no se ofrecen: elegir otra etiqueta no cambiaría lo que se ve.
   */
  readonly discoveryFacets = computed<readonly DiscoveryFacet[]>(() => {
    const pestanas: DiscoveryFacet = {
      key: 'tab',
      // Una pestaña es una pestaña: marcar dos no tiene sentido, y el cliente ya
      // se quedaba con la primera. Declararlo pinta radios en vez de casillas (#18).
      kind: 'SingleSelect',
      label: 'Mostrar',
      values: SEARCH_TABS.map((tab) => ({ value: tab.key, label: tab.label })),
    };
    if (this.explorar.etiquetaFija()) {
      return [pestanas];
    }
    return [
      pestanas,
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
    ];
  });
}
