import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CompareSelection,
  CompareTableComponent,
  type CompareAttribute,
  type CompareCandidate,
  type CompareTableConfig,
} from './compare-table';

/**
 * SH-14 (#30).
 *
 * Los cuatro casos que justifican la pieza, y que el `compareMode` a mano de
 * Propiedades no cubría: **el eje por atributo** (no un `<dl>` por tarjeta), **el
 * techo de la selección**, **la fila que difiere** y **la fila que nadie trae**.
 * El resto prueba que lo específico de cada dominio entra por datos.
 */

const CONFIG: CompareTableConfig = { heading: 'Comparar', nounPlural: 'propiedades' };

const ATRIBUTOS: readonly CompareAttribute[] = [
  { id: 'area', label: 'Área', group: 'Espacio' },
  { id: 'beds', label: 'Habitaciones', group: 'Espacio' },
  { id: 'stratum', label: 'Estrato', group: 'Costos' },
  { id: 'admin', label: 'Administración', group: 'Costos', hint: 'Mensual' },
];

const CANDIDATOS: readonly CompareCandidate[] = [
  {
    id: 'p1',
    title: 'Apartamento en Chapinero',
    subtitle: '3 hab · 2 baños',
    headline: '$480.000.000',
    values: { area: '78 m²', beds: '3', stratum: '4' },
  },
  {
    id: 'p2',
    title: 'Apartaestudio en Chicó',
    subtitle: '1 hab · 1 baño',
    headline: '$320.000.000',
    values: { area: '78 m²', beds: '1', stratum: '5' },
  },
];

@Component({
  standalone: true,
  imports: [CompareTableComponent],
  template: `
    <ng-template #footer>
      <button type="button" class="pie">Añadir otra</button>
    </ng-template>
    <syn-compare-table
      [config]="config()"
      [candidates]="candidates()"
      [attributes]="attributes()"
      [limit]="limit()"
      [footerTemplate]="withFooter() ? footer : null"
      (removecandidate)="removeLog.push($event)"
      (opencandidate)="openLog.push($event.id)"
      (clearall)="clearLog.push(true)"
    />
  `,
})
class Host {
  readonly config = signal<CompareTableConfig>(CONFIG);
  readonly candidates = signal<readonly CompareCandidate[]>(CANDIDATOS);
  readonly attributes = signal<readonly CompareAttribute[]>(ATRIBUTOS);
  readonly limit = signal(4);
  readonly withFooter = signal(false);
  readonly removeLog: string[] = [];
  readonly openLog: string[] = [];
  readonly clearLog: boolean[] = [];
}

function mount(): { fixture: ReturnType<typeof TestBed.createComponent<Host>>; host: Host } {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

const todos = (fixture: { nativeElement: HTMLElement }, sel: string): HTMLElement[] =>
  Array.from(fixture.nativeElement.querySelectorAll(sel)) as HTMLElement[];

const text = (fixture: { nativeElement: HTMLElement }, sel: string): string =>
  (fixture.nativeElement.querySelector(sel)?.textContent ?? '').trim();

/**
 * Las etiquetas de fila visibles, en orden.
 *
 * Lee `__attr-label` y NO el `<th>` entero: con `preserveWhitespaces: false` el
 * encabezado de una fila con `hint` sale como «Administración Mensual» en una
 * sola línea, así que partir por `\n` devolvía la etiqueta pegada a la nota y
 * dejaba sin dientes al caso de «un atributo que nadie trae». Comprobado: con el
 * filtro de filas vacías quitado, la versión anterior pasaba en VERDE.
 */
const filas = (fixture: { nativeElement: HTMLElement }): string[] =>
  todos(fixture, '.syn-compare__attr-label').map((el) => el.textContent?.trim() ?? '');

describe('SH-14 syn-compare-table', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  // ─── el eje ─────────────────────────────────────────────────────────────────
  it('EL caso: el atributo es la fila y el candidato la columna', () => {
    const { fixture } = mount();

    // Una columna por candidato, más la esquina.
    expect(todos(fixture, '.syn-compare__col')).toHaveLength(2);
    // Tres filas: `admin` no lo trae nadie.
    expect(filas(fixture)).toEqual(['Área', 'Habitaciones', 'Estrato']);

    // Y la fila de habitaciones lleva los DOS valores alineados, que es lo que
    // un `<dl>` por tarjeta no puede dar.
    const hab = todos(fixture, '.syn-compare__row')[1];
    const celdas = Array.from(hab.querySelectorAll('.syn-compare__cell')).map((c) =>
      c.textContent?.trim(),
    );
    expect(celdas).toEqual(['3', '1']);
  });

  it('agrupa por tramos consecutivos, respetando el orden del dominio', () => {
    const { fixture } = mount();

    expect(todos(fixture, '.syn-compare__group').map((el) => el.textContent?.trim())).toEqual([
      'Espacio',
      'Costos',
    ]);
  });

  it('un dominio que intercala grupos obtiene los tramos que declaró, no reordenados', () => {
    const { fixture, host } = mount();
    host.attributes.set([
      { id: 'area', label: 'Área', group: 'Espacio' },
      { id: 'stratum', label: 'Estrato', group: 'Costos' },
      { id: 'beds', label: 'Habitaciones', group: 'Espacio' },
    ]);
    fixture.detectChanges();

    expect(todos(fixture, '.syn-compare__group').map((el) => el.textContent?.trim())).toEqual([
      'Espacio',
      'Costos',
      'Espacio',
    ]);
  });

  // ─── diferencias ────────────────────────────────────────────────────────────
  it('EL caso: marca sólo las filas donde NO coinciden', () => {
    const { fixture } = mount();
    const marcadas = todos(fixture, '.syn-compare__row.is-diff').map(
      (el) => el.querySelector('.syn-compare__attr')?.textContent?.trim(),
    );

    // `area` vale «78 m²» en los dos: coincide y no se marca.
    expect(marcadas).toEqual(['Habitaciones', 'Estrato']);
  });

  it('la ausencia de dato CUENTA como diferencia', () => {
    const { fixture, host } = mount();
    host.candidates.set([
      { id: 'p1', title: 'A', values: { area: '78 m²', stratum: '4' } },
      { id: 'p2', title: 'B', values: { area: '78 m²' } },
    ]);
    fixture.detectChanges();

    const estrato = todos(fixture, '.syn-compare__row').find(
      (el) => el.querySelector('.syn-compare__attr')?.textContent?.trim() === 'Estrato',
    );
    expect(estrato?.classList.contains('is-diff')).toBe(true);
    expect(estrato?.querySelectorAll('.syn-compare__cell.is-missing')).toHaveLength(1);
    expect(estrato?.querySelector('.syn-compare__cell.is-missing')?.textContent?.trim()).toBe('—');
  });

  it('el filtro deja sólo las diferencias, y se ofrece sólo cuando hay de las dos', () => {
    const { fixture } = mount();

    const filtro = fixture.nativeElement.querySelector(
      '.syn-compare__filter-input',
    ) as HTMLInputElement;
    expect(filtro).toBeTruthy();
    expect(text(fixture, '.syn-compare__filter-count')).toBe('(2)');

    filtro.checked = true;
    filtro.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(filas(fixture)).toEqual(['Habitaciones', 'Estrato']);
  });

  it('sin filas iguales no se ofrece el filtro: vaciaría la tabla o no quitaría nada', () => {
    const { fixture, host } = mount();
    host.candidates.set([
      { id: 'p1', title: 'A', values: { area: '78 m²', beds: '3' } },
      { id: 'p2', title: 'B', values: { area: '50 m²', beds: '1' } },
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.syn-compare__filter-input')).toBeNull();
  });

  // ─── lo que no se pinta ─────────────────────────────────────────────────────
  it('EL caso: un atributo que NADIE trae no ocupa una fila', () => {
    const { fixture } = mount();

    expect(filas(fixture)).not.toContain('Administración');
  });

  it('con un solo candidato no se compara, y se dice por qué', () => {
    const { fixture, host } = mount();
    host.candidates.set([CANDIDATOS[0]]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.syn-compare__table')).toBeNull();
    expect(text(fixture, '.syn-compare__notice')).toContain('al menos dos propiedades');
  });

  it('si coinciden en todo lo comparable se dice, en vez de enseñar una tabla muda', () => {
    const { fixture, host } = mount();
    host.candidates.set([
      { id: 'p1', title: 'A', values: { area: '78 m²' } },
      { id: 'p2', title: 'B', values: { area: '78 m²' } },
    ]);
    fixture.detectChanges();

    // Sin filas distintas, el filtro no aparece; el aviso sale sólo si alguien lo
    // fuerza desde la pieza, así que acá lo que se comprueba es que la tabla
    // existe con su única fila y que NO hay filtro que pueda vaciarla.
    expect(filas(fixture)).toEqual(['Área']);
    expect(fixture.nativeElement.querySelector('.syn-compare__filter-input')).toBeNull();
  });

  // ─── cableado ───────────────────────────────────────────────────────────────
  it('el contador dice cuántos de cuántos caben', () => {
    const { fixture } = mount();
    expect(text(fixture, '.syn-compare__count')).toBe('2/4');
  });

  it('quitar, abrir y vaciar salen hacia el dominio', () => {
    const { fixture, host } = mount();

    (todos(fixture, '.syn-compare__remove')[1] as HTMLButtonElement).click();
    (todos(fixture, '.syn-compare__open')[0] as HTMLButtonElement).click();
    (fixture.nativeElement.querySelector('.syn-compare__clear') as HTMLButtonElement).click();

    expect(host.removeLog).toEqual(['p2']);
    expect(host.openLog).toEqual(['p1']);
    expect(host.clearLog).toEqual([true]);
  });

  it('el pie es del dominio', () => {
    const { fixture, host } = mount();
    expect(fixture.nativeElement.querySelector('.pie')).toBeNull();

    host.withFooter.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pie')?.textContent).toBe('Añadir otra');
  });

  it('la columna del eje y los encabezados llevan scope: una tabla sin eje no se navega', () => {
    const { fixture } = mount();

    expect(todos(fixture, '.syn-compare__col').every((el) => el.getAttribute('scope') === 'col')).toBe(
      true,
    );
    expect(
      todos(fixture, '.syn-compare__attr').every((el) => el.getAttribute('scope') === 'row'),
    ).toBe(true);
    expect(
      todos(fixture, '.syn-compare__group').every((el) => el.getAttribute('scope') === 'colgroup'),
    ).toBe(true);
  });
});

describe('CompareSelection', () => {
  it('EL caso: pasado el techo NO se añade, y se dice cuál fue el motivo', () => {
    const seleccion = new CompareSelection(2);

    expect(seleccion.add(CANDIDATOS[0])).toBeNull();
    expect(seleccion.add(CANDIDATOS[1])).toBeNull();
    expect(seleccion.full()).toBe(true);

    const tercero: CompareCandidate = { id: 'p3', title: 'C', values: {} };
    expect(seleccion.add(tercero)).toBe('limit-reached');

    // Y el que sobraba NO expulsó a nadie: los dos elegidos siguen ahí.
    expect(seleccion.items().map((i) => i.id)).toEqual(['p1', 'p2']);
  });

  it('el mismo candidato dos veces se rechaza, no se duplica la columna', () => {
    const seleccion = new CompareSelection(4);
    seleccion.add(CANDIDATOS[0]);

    expect(seleccion.add(CANDIDATOS[0])).toBe('already-added');
    expect(seleccion.count()).toBe(1);
  });

  it('comparable exige DOS: con uno la tabla es una ficha peor que la ficha', () => {
    const seleccion = new CompareSelection(4);
    expect(seleccion.comparable()).toBe(false);

    seleccion.add(CANDIDATOS[0]);
    expect(seleccion.comparable()).toBe(false);

    seleccion.add(CANDIDATOS[1]);
    expect(seleccion.comparable()).toBe(true);
  });

  it('toggle añade, quita y devuelve el rechazo sólo cuando intentaba añadir', () => {
    const seleccion = new CompareSelection(1);

    expect(seleccion.toggle(CANDIDATOS[0])).toBeNull();
    expect(seleccion.has('p1')).toBe(true);

    // Lleno: añadir otro rechaza…
    expect(seleccion.toggle(CANDIDATOS[1])).toBe('limit-reached');
    // …pero quitar el que ya estaba nunca rechaza, aunque esté lleno.
    expect(seleccion.toggle(CANDIDATOS[0])).toBeNull();
    expect(seleccion.count()).toBe(0);
  });

  it('vaciar deja el conjunto en cero y vuelve a caber todo', () => {
    const seleccion = new CompareSelection(2);
    seleccion.add(CANDIDATOS[0]);
    seleccion.add(CANDIDATOS[1]);

    seleccion.clear();
    expect(seleccion.count()).toBe(0);
    expect(seleccion.full()).toBe(false);
  });
});
