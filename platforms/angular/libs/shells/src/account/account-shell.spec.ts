import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AccountShellComponent, type AccountShellConfig } from './account-shell';

interface Order {
  readonly ref: string;
  readonly title: string;
}

const CONFIG: AccountShellConfig = {
  heading: 'Mi cuenta',
  sections: [
    { id: 'compras', label: 'Mis compras', kind: 'inbox' },
    { id: 'favoritos', label: 'Favoritos', badge: 2 },
    { id: 'perfil', label: 'Perfil' },
  ],
  inboxEmptyMessage: 'Sin compras todavía',
};

@Component({
  standalone: true,
  imports: [AccountShellComponent],
  template: `
    <ng-template #row let-order let-selected="selected">
      <span class="row-title" [attr.data-selected]="selected">{{ order.title }}</span>
    </ng-template>
    <ng-template #detail let-order>
      <p class="detail-body">Detalle de {{ order.ref }}</p>
    </ng-template>
    <ng-template #section let-current>
      <p class="section-body" [attr.data-section]="current.id">sección {{ current.id }}</p>
    </ng-template>
    <syn-account-shell
      [config]="config()"
      [items]="items()"
      [loading]="loading()"
      [itemTemplate]="row"
      [detailTemplate]="detail"
      [sectionTemplate]="section"
      (sectionchange)="sectionLog.push($event)"
      (itemselect)="selectLog.push($event.ref)"
    />
  `,
})
class HostComponent {
  readonly config = signal<AccountShellConfig>(CONFIG);
  readonly items = signal<readonly Order[]>([]);
  readonly loading = signal(false);
  readonly sectionLog: string[] = [];
  readonly selectLog: string[] = [];
}

describe(AccountShellComponent.name, () => {
  async function createHost() {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => TestBed.resetTestingModule());

  // ── empty ───────────────────────────────────────────────────────────────────
  it('shows the configured empty inbox message and the detail placeholder (empty case)', async () => {
    const fixture = await createHost();
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('.syn-account__heading')?.textContent).toContain('Mi cuenta');
    expect(element.querySelector('.syn-account__empty')?.textContent).toContain(
      'Sin compras todavía',
    );
    expect(element.querySelector('.syn-account__placeholder')).toBeTruthy();
    expect(element.querySelectorAll('.syn-account__nav-btn')).toHaveLength(3);
  });

  // ── happy ───────────────────────────────────────────────────────────────────
  it('renders inbox rows, selects one and shows its templated detail (happy case)', async () => {
    const fixture = await createHost();
    const host = fixture.componentInstance;
    host.items.set([
      { ref: 'ORD-1', title: 'Compra uno' },
      { ref: 'ORD-2', title: 'Compra dos' },
    ]);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const rows = element.querySelectorAll<HTMLButtonElement>('.syn-account__row');
    expect(rows).toHaveLength(2);

    rows[1].click();
    fixture.detectChanges();

    expect(host.selectLog).toEqual(['ORD-2']);
    expect(fixture.nativeElement.querySelector('.detail-body')?.textContent).toContain('ORD-2');
    expect(
      fixture.nativeElement
        .querySelectorAll('.syn-account__row')[1]
        .classList.contains('is-selected'),
    ).toBe(true);
  });

  // ── filter ──────────────────────────────────────────────────────────────────
  it('switching sections swaps inbox for the custom section template (filter case)', async () => {
    const fixture = await createHost();
    const host = fixture.componentInstance;
    host.items.set([{ ref: 'ORD-1', title: 'Compra uno' }]);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('.syn-account__inbox')).toBeTruthy();

    const nav = element.querySelectorAll<HTMLButtonElement>('.syn-account__nav-btn');
    expect(nav[1].querySelector('.syn-account__badge')?.textContent).toContain('2');

    nav[1].click();
    fixture.detectChanges();

    expect(host.sectionLog).toEqual(['favoritos']);
    expect(fixture.nativeElement.querySelector('.syn-account__inbox')).toBeNull();
    expect(
      fixture.nativeElement.querySelector('.section-body')?.getAttribute('data-section'),
    ).toBe('favoritos');
  });

  // ── idempotent ─────────────────────────────────────────────────────────────
  it('re-selecting the active section or row emits nothing new (idempotent case)', async () => {
    const fixture = await createHost();
    const host = fixture.componentInstance;
    host.items.set([{ ref: 'ORD-1', title: 'Compra uno' }]);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const nav = element.querySelectorAll<HTMLButtonElement>('.syn-account__nav-btn');

    nav[0].click(); // already active
    fixture.detectChanges();
    expect(host.sectionLog).toEqual([]);

    const row = element.querySelector<HTMLButtonElement>('.syn-account__row')!;
    row.click();
    row.click();
    fixture.detectChanges();
    expect(host.selectLog).toEqual(['ORD-1']);

    // Selection resets when the items input changes (fresh inbox).
    host.items.set([{ ref: 'ORD-9', title: 'Compra nueve' }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.detail-body')).toBeNull();
    expect(fixture.nativeElement.querySelector('.syn-account__placeholder')).toBeTruthy();
  });
});
