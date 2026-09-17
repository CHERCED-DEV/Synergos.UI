import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ConsoleShellComponent,
  type ConsoleColumn,
  type ConsoleShellConfig,
  type ConsoleSort,
} from './console-shell';

/**
 * El sobre de lista de SH-5 (#21): orden y página.
 *
 * Lo que de verdad se prueba acá no es «ordena bien» sino **quién ordena**. Hoy
 * las listas del profesional llegan completas y ordenar en el cliente es
 * correcto; el día que el backend pagine, seguir ordenando aquí enseñaría «lo
 * más urgente» de un subconjunto arbitrario **con la cara de estar ordenado**.
 * Por eso `sortMode: 'server'` tiene su caso propio: es el que impide que ese
 * defecto entre en silencio.
 */

interface Caso {
  readonly reference: string;
  readonly citizen: string;
  readonly slaDaysLeft: number | null;
  readonly submittedAt: string;
}

const COLUMNAS: readonly ConsoleColumn[] = [
  { key: 'reference', label: 'Radicado', sortable: 'text' },
  { key: 'citizen', label: 'Solicitante' },
  { key: 'slaDaysLeft', label: 'SLA', align: 'end', sortable: 'number' },
  { key: 'submittedAt', label: 'Radicada', sortable: 'date' },
];

const CONFIG: ConsoleShellConfig = {
  heading: 'Cola',
  sections: [{ id: 'cola', label: 'Cola', kind: 'table' }],
  emptyMessage: 'Sin casos',
};

/** Deliberadamente desordenados, y con un plazo ausente. */
const CASOS: readonly Caso[] = [
  { reference: 'RAD-9', citizen: 'Ana', slaDaysLeft: 5, submittedAt: '2026-09-05T10:00:00Z' },
  { reference: 'RAD-10', citizen: 'Beto', slaDaysLeft: -3, submittedAt: '2026-09-01T10:00:00Z' },
  { reference: 'RAD-2', citizen: 'Carla', slaDaysLeft: null, submittedAt: '2026-09-09T10:00:00Z' },
  { reference: 'RAD-7', citizen: 'Dani', slaDaysLeft: 0, submittedAt: '2026-09-07T10:00:00Z' },
];

@Component({
  standalone: true,
  imports: [ConsoleShellComponent],
  template: `
    <ng-template #cell let-row let-column="column">
      <span class="cell" [attr.data-col]="column.key">{{ row[column.key] }}</span>
    </ng-template>
    <syn-console-shell
      [config]="config()"
      [rows]="rows()"
      [columns]="columnas"
      [defaultSort]="defaultSort()"
      [sortMode]="sortMode()"
      [pageSize]="pageSize()"
      [pageMode]="pageMode()"
      [total]="total()"
      [cellTemplate]="cell"
      (sortchange)="sortLog.push($event)"
      (pagechange)="pageLog.push($event)"
    />
  `,
})
class Host {
  readonly columnas = COLUMNAS;
  readonly config = signal<ConsoleShellConfig>(CONFIG);
  readonly rows = signal<readonly Caso[]>(CASOS);
  readonly defaultSort = signal<ConsoleSort | null>(null);
  readonly sortMode = signal<'client' | 'server'>('client');
  readonly pageSize = signal(0);
  readonly pageMode = signal<'client' | 'server'>('client');
  readonly total = signal<number | null>(null);
  readonly sortLog: ConsoleSort[] = [];
  readonly pageLog: number[] = [];
}

function mount(): { fixture: ReturnType<typeof TestBed.createComponent<Host>>; host: Host } {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

/** La primera columna de cada fila pintada, en orden. */
function refs(fixture: { nativeElement: HTMLElement }): string[] {
  return Array.from(
    fixture.nativeElement.querySelectorAll('[data-col="reference"]'),
    (n) => ((n as Element).textContent ?? '').trim(),
  );
}

function cabecera(fixture: { nativeElement: HTMLElement }, key: string): HTMLElement | null {
  const idx = COLUMNAS.findIndex((c) => c.key === key);
  return fixture.nativeElement.querySelectorAll('th')[idx] as HTMLElement | undefined ?? null;
}

function pulsarCabecera(fixture: { nativeElement: HTMLElement }, key: string): void {
  cabecera(fixture, key)?.querySelector('button')?.click();
}

describe('SH-5 · el sobre de lista', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  // ─── sin nada declarado, todo como estaba ──────────────────────────────────
  it('sin defaultSort ni pageSize se comporta exactamente como antes', () => {
    const { fixture } = mount();

    expect(refs(fixture)).toEqual(['RAD-9', 'RAD-10', 'RAD-2', 'RAD-7']);
    expect(fixture.nativeElement.querySelector('.syn-console__paging')).toBeNull();
  });

  it('una columna sin `sortable` no es un botón', () => {
    const { fixture } = mount();

    expect(cabecera(fixture, 'citizen')?.querySelector('button')).toBeNull();
    expect(cabecera(fixture, 'citizen')?.getAttribute('aria-sort')).toBeNull();
    expect(cabecera(fixture, 'slaDaysLeft')?.querySelector('button')).not.toBeNull();
  });

  // ─── el caso del negocio ───────────────────────────────────────────────────
  it('con defaultSort por plazo, lo vencido queda arriba', () => {
    const { fixture, host } = mount();
    host.defaultSort.set({ key: 'slaDaysLeft', direction: 'asc' });
    fixture.detectChanges();

    // -3 (vencido) · 0 (vence hoy) · 5 · y el que no tiene plazo, al final.
    expect(refs(fixture)).toEqual(['RAD-10', 'RAD-7', 'RAD-9', 'RAD-2']);
  });

  it('los vacíos van al final en las DOS direcciones', () => {
    const { fixture, host } = mount();
    host.defaultSort.set({ key: 'slaDaysLeft', direction: 'desc' });
    fixture.detectChanges();

    // Invertido, pero el que no tiene plazo SIGUE al final: no tener el dato no
    // es «el más urgente» ni «el menos».
    expect(refs(fixture)).toEqual(['RAD-9', 'RAD-7', 'RAD-10', 'RAD-2']);
  });

  it('el texto ordena como una persona espera: RAD-9 antes que RAD-10', () => {
    const { fixture } = mount();
    pulsarCabecera(fixture, 'reference');
    fixture.detectChanges();

    expect(refs(fixture)).toEqual(['RAD-2', 'RAD-7', 'RAD-9', 'RAD-10']);
  });

  it('las fechas se ordenan como fechas, no como cadenas', () => {
    const { fixture } = mount();
    pulsarCabecera(fixture, 'submittedAt');
    fixture.detectChanges();

    expect(refs(fixture)).toEqual(['RAD-10', 'RAD-9', 'RAD-7', 'RAD-2']);
  });

  // ─── interacción ───────────────────────────────────────────────────────────
  it('el primer clic es ascendente y el segundo invierte', () => {
    const { fixture, host } = mount();

    pulsarCabecera(fixture, 'slaDaysLeft');
    fixture.detectChanges();
    expect(host.sortLog.at(-1)).toEqual({ key: 'slaDaysLeft', direction: 'asc' });

    pulsarCabecera(fixture, 'slaDaysLeft');
    fixture.detectChanges();
    expect(host.sortLog.at(-1)).toEqual({ key: 'slaDaysLeft', direction: 'desc' });
  });

  it('aria-sort dice cuál está activa y cómo', () => {
    const { fixture } = mount();
    pulsarCabecera(fixture, 'slaDaysLeft');
    fixture.detectChanges();

    expect(cabecera(fixture, 'slaDaysLeft')?.getAttribute('aria-sort')).toBe('ascending');
    expect(cabecera(fixture, 'reference')?.getAttribute('aria-sort')).toBe('none');
  });

  // ─── EL caso: quién ordena ─────────────────────────────────────────────────
  it('en modo servidor NO reordena: emite y espera', () => {
    const { fixture, host } = mount();
    host.sortMode.set('server');
    fixture.detectChanges();

    pulsarCabecera(fixture, 'slaDaysLeft');
    fixture.detectChanges();

    // Avisó…
    expect(host.sortLog).toEqual([{ key: 'slaDaysLeft', direction: 'asc' }]);
    // …y NO tocó las filas. Reordenarlas aquí sería ordenar la página que tiene
    // a mano y enseñarla como si fuera la cola entera.
    expect(refs(fixture)).toEqual(['RAD-9', 'RAD-10', 'RAD-2', 'RAD-7']);
  });

  // ─── paginación ────────────────────────────────────────────────────────────
  it('con pageSize corta las filas y dice cuántas hay en total', () => {
    const { fixture, host } = mount();
    host.pageSize.set(2);
    fixture.detectChanges();

    expect(refs(fixture)).toEqual(['RAD-9', 'RAD-10']);
    expect(fixture.nativeElement.querySelector('.syn-console__page-status')?.textContent).toContain(
      '4 casos',
    );
  });

  it('avanzar y retroceder de página emite y cambia lo que se ve', () => {
    const { fixture, host } = mount();
    host.pageSize.set(2);
    fixture.detectChanges();

    const botones = Array.from(
      fixture.nativeElement.querySelectorAll('.syn-console__page-btn'),
    );
    (botones[1] as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(refs(fixture)).toEqual(['RAD-2', 'RAD-7']);
    expect(host.pageLog).toEqual([2]);

    (botones[0] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(refs(fixture)).toEqual(['RAD-9', 'RAD-10']);
  });

  it('reordenar vuelve a la primera página', () => {
    const { fixture, host } = mount();
    host.pageSize.set(2);
    fixture.detectChanges();

    const botones = Array.from(
      fixture.nativeElement.querySelectorAll('.syn-console__page-btn'),
    );
    (botones[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(refs(fixture)).toEqual(['RAD-2', 'RAD-7']);

    // Quedarse en la página 2 tras reordenar enseña un tramo del medio y parece
    // un fallo de datos.
    pulsarCabecera(fixture, 'slaDaysLeft');
    fixture.detectChanges();
    expect(refs(fixture)).toEqual(['RAD-10', 'RAD-7']);
  });

  it('en modo servidor la página NO se corta aquí y el total lo dice el backend', () => {
    const { fixture, host } = mount();
    host.pageMode.set('server');
    host.pageSize.set(2);
    host.total.set(40);
    fixture.detectChanges();

    // Llegaron cuatro filas y se pintan las cuatro: el servidor ya las cortó.
    expect(refs(fixture)).toEqual(['RAD-9', 'RAD-10', 'RAD-2', 'RAD-7']);
    expect(fixture.nativeElement.querySelector('.syn-console__page-status')?.textContent).toContain(
      '40 casos',
    );
    // 40 / 2 = 20 páginas, no 2.
    expect(fixture.nativeElement.querySelector('.syn-console__page-status')?.textContent).toContain(
      'de 20',
    );
  });

  it('no pagina cuando todo cabe en una página', () => {
    const { fixture, host } = mount();
    host.pageSize.set(10);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.syn-console__paging')).toBeNull();
  });

  // ─── vacío ─────────────────────────────────────────────────────────────────
  it('sin filas no hay tabla ni paginador que ordenar', () => {
    const { fixture, host } = mount();
    host.rows.set([]);
    host.pageSize.set(2);
    fixture.detectChanges();

    expect(refs(fixture)).toEqual([]);
    expect(fixture.nativeElement.querySelector('.syn-console__paging')).toBeNull();
  });
});
