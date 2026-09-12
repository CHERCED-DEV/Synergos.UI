import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CartShellComponent,
  type CartAction,
  type CartGroup,
  type CartLine,
  type CartNote,
  type CartQuantityChange,
  type CartShellConfig,
  type CartSummaryRow,
} from './cart-shell';

/**
 * SH-12 (#22).
 *
 * Los dos casos que justifican la pieza —y que ninguno de los tres dominios
 * tenía cubierto— son **el reloj del apartado** y **las acciones con el carrito
 * vacío**. El resto prueba que lo que cada dominio traía suyo (grupos, resumen,
 * icono, cross-sell) entra por datos y no por un `if` dentro de la pieza.
 */

const CONFIG: CartShellConfig = {
  heading: 'Tu carrito',
  emptyMessage: 'Tu carrito está vacío.',
};

const LINEAS: readonly CartLine[] = [
  { id: 'l1', label: 'Camiseta azul', detail: 'Talla M', unit: '$32.000 c/u', total: '$64.000', quantity: 2 },
  { id: 'l2', label: 'Gorra', total: '$18.000', quantity: 1 },
];

@Component({
  standalone: true,
  imports: [CartShellComponent],
  template: `
    <ng-template #leading let-line>
      <span class="icono" [attr.data-kind]="line.kind">◆</span>
    </ng-template>
    <syn-cart-shell
      [config]="config()"
      [lines]="lines()"
      [groups]="groups()"
      [summary]="summary()"
      [total]="total()"
      [actions]="actions()"
      [note]="note()"
      [holdExpiresAt]="holdExpiresAt()"
      [leadingTemplate]="withLeading() ? leading : null"
      (remove)="removeLog.push($event)"
      (quantitychange)="qtyLog.push($event)"
      (action)="actionLog.push($event)"
      (close)="closeLog.push(true)"
      (holdexpired)="expiredLog.push(true)"
    />
  `,
})
class Host {
  readonly config = signal<CartShellConfig>(CONFIG);
  readonly lines = signal<readonly CartLine[]>(LINEAS);
  readonly groups = signal<readonly CartGroup[]>([]);
  readonly summary = signal<readonly CartSummaryRow[]>([]);
  readonly total = signal('');
  readonly actions = signal<readonly CartAction[]>([]);
  readonly note = signal<CartNote | null>(null);
  readonly holdExpiresAt = signal<string | null>(null);
  readonly withLeading = signal(false);
  readonly removeLog: string[] = [];
  readonly qtyLog: CartQuantityChange[] = [];
  readonly actionLog: string[] = [];
  readonly closeLog: boolean[] = [];
  readonly expiredLog: boolean[] = [];
}

function mount(): { fixture: ReturnType<typeof TestBed.createComponent<Host>>; host: Host } {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

const text = (fixture: { nativeElement: HTMLElement }, sel: string): string =>
  (fixture.nativeElement.querySelector(sel)?.textContent ?? '').trim();

const todos = (fixture: { nativeElement: HTMLElement }, sel: string): HTMLElement[] =>
  Array.from(fixture.nativeElement.querySelectorAll(sel)) as HTMLElement[];

/** Los botones de cantidad de la línea n: [menos, más]. */
function pasos(fixture: { nativeElement: HTMLElement }, n: number): HTMLButtonElement[] {
  const linea = todos(fixture, '.syn-cart__line')[n];
  return Array.from(linea.querySelectorAll('.syn-cart__qty-btn')) as HTMLButtonElement[];
}

describe('SH-12 syn-cart-shell', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  // ─── feliz ──────────────────────────────────────────────────────────────────
  it('pinta las líneas con lo que el dominio ya formateó', () => {
    const { fixture } = mount();

    expect(todos(fixture, '.syn-cart__line')).toHaveLength(2);
    expect(text(fixture, '.syn-cart__line-label')).toBe('Camiseta azul');
    expect(text(fixture, '.syn-cart__line-detail')).toBe('Talla M');
    expect(text(fixture, '.syn-cart__line-total')).toBe('$64.000');
    expect(text(fixture, '.syn-cart__heading')).toContain('(2)');
  });

  it('el total simple sale cuando no hay resumen, y el resumen manda cuando lo hay', () => {
    const { fixture, host } = mount();
    host.total.set('$82.000');
    fixture.detectChanges();
    expect(text(fixture, '.syn-cart__total')).toContain('$82.000');

    host.summary.set([
      { id: 'sub', label: 'Subtotal', value: '$82.000' },
      { id: 'fee', label: 'Cargos por servicio', value: '$8.200' },
      { id: 'tot', label: 'Total', value: '$90.200', emphasis: true },
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.syn-cart__total')).toBeNull();
    expect(todos(fixture, '.syn-cart__summary-row')).toHaveLength(3);
    expect(todos(fixture, '.syn-cart__summary-row')[2].classList.contains('is-total')).toBe(true);
  });

  // ─── vacío ──────────────────────────────────────────────────────────────────
  it('vacío no es un error: lo dice y no pinta líneas', () => {
    const { fixture, host } = mount();
    host.lines.set([]);
    fixture.detectChanges();

    expect(text(fixture, '.syn-cart__empty')).toBe('Tu carrito está vacío.');
    expect(todos(fixture, '.syn-cart__line')).toHaveLength(0);
    expect(text(fixture, '.syn-cart__heading')).not.toContain('(');
  });

  // ─── EL filtro: acciones con el carrito vacío ───────────────────────────────
  it('el default es `filled`: sin declarar nada, la acción desaparece al vaciarse', () => {
    const { fixture, host } = mount();
    host.actions.set([{ id: 'pagar', label: 'Ir a pagar', kind: 'primary' }]);
    fixture.detectChanges();
    expect(todos(fixture, '.syn-cart__action')).toHaveLength(1);

    host.lines.set([]);
    fixture.detectChanges();

    // «Ir a pagar» sobre cero líneas manda a un checkout que no puede completarse.
    expect(todos(fixture, '.syn-cart__action')).toHaveLength(0);
  });

  it('cada acción se pinta cuando dice, y las tres visibilidades se distinguen', () => {
    const { fixture, host } = mount();
    host.actions.set([
      { id: 'explorar', label: 'Explorar eventos', visibility: 'empty' },
      { id: 'seguir', label: 'Seguir comprando', visibility: 'always' },
      { id: 'pagar', label: 'Ir a pagar', kind: 'primary', visibility: 'filled' },
    ]);
    fixture.detectChanges();
    expect(todos(fixture, '.syn-cart__action').map((b) => b.textContent?.trim())).toEqual([
      'Seguir comprando',
      'Ir a pagar',
    ]);

    host.lines.set([]);
    fixture.detectChanges();
    // La salida de «no tengo nada» sólo sirve ahí: con líneas sería una tercera
    // puerta al mismo sitio.
    expect(todos(fixture, '.syn-cart__action').map((b) => b.textContent?.trim())).toEqual([
      'Explorar eventos',
      'Seguir comprando',
    ]);
  });

  it('una acción deshabilitada no emite', () => {
    const { fixture, host } = mount();
    host.actions.set([{ id: 'pagar', label: 'Ir a pagar', kind: 'primary', disabled: true }]);
    fixture.detectChanges();

    const boton = fixture.nativeElement.querySelector('.syn-cart__action') as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    boton.click();
    fixture.detectChanges();
    expect(host.actionLog).toEqual([]);
  });

  // ─── grupos ─────────────────────────────────────────────────────────────────
  it('agrupa por vendedor cuando el dominio declara grupos', () => {
    const { fixture, host } = mount();
    host.lines.set([
      { id: 'a', label: 'A', groupId: 'v1' },
      { id: 'b', label: 'B', groupId: 'v2' },
      { id: 'c', label: 'C', groupId: 'v1' },
    ]);
    host.groups.set([
      { id: 'v1', label: 'Vendido por Taller', total: '$10' },
      { id: 'v2', label: 'Vendido por Kiosco' },
    ]);
    fixture.detectChanges();

    const grupos = todos(fixture, '.syn-cart__group');
    expect(grupos).toHaveLength(2);
    expect(grupos[0].querySelector('.syn-cart__group-label')?.textContent?.trim()).toBe(
      'Vendido por Taller',
    );
    expect(grupos[0].querySelectorAll('.syn-cart__line')).toHaveLength(2);
    expect(grupos[1].querySelector('.syn-cart__group-total')).toBeNull();
  });

  it('una línea de un grupo que no existe se pinta suelta, no se pierde', () => {
    const { fixture, host } = mount();
    host.lines.set([
      { id: 'a', label: 'A', groupId: 'fantasma' },
      { id: 'b', label: 'B', groupId: 'v1' },
    ]);
    host.groups.set([{ id: 'v1', label: 'Vendido por Taller' }]);
    fixture.detectChanges();

    // Esconderla perdería una línea que la persona sí agregó — y el total, que lo
    // calcula el dominio, la seguiría contando.
    expect(todos(fixture, '.syn-cart__line')).toHaveLength(2);
    expect(todos(fixture, '.syn-cart__line-label').map((n) => n.textContent?.trim())).toEqual([
      'A',
      'B',
    ]);
  });

  // ─── cantidad ───────────────────────────────────────────────────────────────
  it('sin `quantity` la línea no tiene paso de cantidad', () => {
    const { fixture, host } = mount();
    host.lines.set([{ id: 'v', label: 'Vuelo BOG-MDE', total: '$300.000' }]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.syn-cart__qty')).toBeNull();
  });

  it('subir y bajar emiten la cantidad nueva', () => {
    const { fixture, host } = mount();

    pasos(fixture, 0)[1].click();
    fixture.detectChanges();
    pasos(fixture, 0)[0].click();
    fixture.detectChanges();

    expect(host.qtyLog).toEqual([
      { id: 'l1', quantity: 3 },
      { id: 'l1', quantity: 1 },
    ]);
  });

  it('bajar de 1 NO emite cantidad 0: quita la línea', () => {
    const { fixture, host } = mount();

    pasos(fixture, 1)[0].click();
    fixture.detectChanges();

    // Emitir `quantity: 0` obligaría a cada dominio a traducirlo, y el que se
    // olvidara dejaría una línea fantasma de cero unidades en el carrito.
    expect(host.qtyLog).toEqual([]);
    expect(host.removeLog).toEqual(['l2']);
  });

  it('en el tope el «+» se deshabilita y no emite', () => {
    const { fixture, host } = mount();
    host.lines.set([{ id: 'e', label: 'Entrada general', quantity: 4, maxQuantity: 4 }]);
    fixture.detectChanges();

    const mas = pasos(fixture, 0)[1];
    expect(mas.disabled).toBe(true);
    mas.click();
    fixture.detectChanges();
    expect(host.qtyLog).toEqual([]);
  });

  it('una línea que no se puede quitar no ofrece ni la «x» ni el «−» en 1', () => {
    const { fixture, host } = mount();
    host.lines.set([{ id: 'p', label: 'Tarifa base', quantity: 1, removable: false }]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.syn-cart__remove')).toBeNull();
    expect(pasos(fixture, 0)[0].disabled).toBe(true);
  });

  // ─── idempotente ────────────────────────────────────────────────────────────
  it('quitar dos veces la misma línea avisa dos veces y no cambia nada de la pieza', () => {
    const { fixture, host } = mount();
    const boton = fixture.nativeElement.querySelector('.syn-cart__remove') as HTMLButtonElement;

    boton.click();
    fixture.detectChanges();
    boton.click();
    fixture.detectChanges();

    // La pieza no borra nada: el dueño de las líneas es el dominio.
    expect(host.removeLog).toEqual(['l1', 'l1']);
    expect(todos(fixture, '.syn-cart__line')).toHaveLength(2);
  });

  // ─── EL reloj del apartado ──────────────────────────────────────────────────
  describe('el reloj del apartado', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-12T10:00:00Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('sin apartado no hay reloj — no despierta al navegador cada segundo', () => {
      const { fixture } = mount();
      expect(fixture.nativeElement.querySelector('.syn-cart__hold')).toBeNull();
    });

    it('cuenta lo que queda y lo va bajando solo', () => {
      const { fixture, host } = mount();
      host.holdExpiresAt.set('2026-09-12T10:15:00Z');
      fixture.detectChanges();
      expect(text(fixture, '.syn-cart__hold')).toContain('15:00');

      vi.advanceTimersByTime(60_000);
      fixture.detectChanges();
      expect(text(fixture, '.syn-cart__hold')).toContain('14:00');
    });

    it('bajo el umbral deja de ser información y pasa a ser aviso', () => {
      const { fixture, host } = mount();
      host.config.set({ ...CONFIG, holdWarnSeconds: 120 });
      host.holdExpiresAt.set('2026-09-12T10:15:00Z');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.syn-cart__hold')?.getAttribute('role')).toBe(
        'status',
      );

      vi.advanceTimersByTime(13 * 60_000 + 1_000);
      fixture.detectChanges();

      const aviso = fixture.nativeElement.querySelector('.syn-cart__hold');
      expect(aviso?.classList.contains('is-urgent')).toBe(true);
      expect(aviso?.getAttribute('role')).toBe('alert');
    });

    it('al vencerse lo dice y avisa al dominio UNA sola vez', () => {
      const { fixture, host } = mount();
      host.holdExpiresAt.set('2026-09-12T10:00:30Z');
      fixture.detectChanges();
      expect(host.expiredLog).toEqual([]);

      vi.advanceTimersByTime(31_000);
      fixture.detectChanges();
      expect(host.expiredLog).toEqual([true]);
      expect(fixture.nativeElement.querySelector('.syn-cart__hold')?.classList.contains('is-expired')).toBe(
        true,
      );

      // Sigue corriendo el reloj: avisar cada segundo convertiría el aviso en ruido.
      vi.advanceTimersByTime(10_000);
      fixture.detectChanges();
      expect(host.expiredLog).toEqual([true]);
    });

    it('una fecha que no se entiende NO es «vencido»', () => {
      const { fixture, host } = mount();
      host.holdExpiresAt.set('mañana');
      fixture.detectChanges();

      // Decirle a alguien que su cupo se murió por un fallo de formato es peor
      // que no decir nada.
      expect(fixture.nativeElement.querySelector('.syn-cart__hold')).toBeNull();
      expect(host.expiredLog).toEqual([]);
    });

    it('un apartado nuevo vuelve a poder avisar', () => {
      const { fixture, host } = mount();
      host.holdExpiresAt.set('2026-09-12T10:00:10Z');
      fixture.detectChanges();
      vi.advanceTimersByTime(11_000);
      fixture.detectChanges();
      expect(host.expiredLog).toEqual([true]);

      host.holdExpiresAt.set('2026-09-12T10:30:00Z');
      fixture.detectChanges();
      vi.advanceTimersByTime(30 * 60_000);
      fixture.detectChanges();

      expect(host.expiredLog).toEqual([true, true]);
    });

    it('con el carrito vacío no hay apartado que contar', () => {
      const { fixture, host } = mount();
      host.holdExpiresAt.set('2026-09-12T10:15:00Z');
      host.lines.set([]);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.syn-cart__hold')).toBeNull();
    });
  });

  // ─── lo que cada dominio trae suyo entra por datos, no por un `if` ──────────
  it('el icono por tipo de producto entra por template', () => {
    const { fixture, host } = mount();
    host.lines.set([{ id: 'h', label: 'Hotel Bogotá', kind: 'hotel' }]);
    host.withLeading.set(true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.icono')?.getAttribute('data-kind')).toBe('hotel');
  });

  it('el cross-sell es un aviso con acción y emite por el mismo canal', () => {
    const { fixture, host } = mount();
    host.note.set({ text: 'Te falta el hotel', actionId: 'add-stay', actionLabel: 'Agregar' });
    fixture.detectChanges();

    expect(text(fixture, '.syn-cart__note-text')).toBe('Te falta el hotel');
    (fixture.nativeElement.querySelector('.syn-cart__note-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.actionLog).toEqual(['add-stay']);
  });

  it('un aviso sin acción no pinta botón', () => {
    const { fixture, host } = mount();
    host.note.set({ text: 'Los precios pueden cambiar' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.syn-cart__note-btn')).toBeNull();
  });

  // ─── densidad ───────────────────────────────────────────────────────────────
  it('el cajón es la misma pieza, y sólo pinta el cierre si le dan rótulo', () => {
    const { fixture, host } = mount();
    host.config.set({ ...CONFIG, density: 'drawer' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.syn-cart-shell')?.classList.contains('is-drawer')).toBe(
      true,
    );
    expect(fixture.nativeElement.querySelector('.syn-cart__close')).toBeNull();

    host.config.set({ ...CONFIG, density: 'drawer', closeLabel: 'Cerrar carrito' });
    fixture.detectChanges();
    const cerrar = fixture.nativeElement.querySelector('.syn-cart__close') as HTMLButtonElement;
    expect(cerrar.getAttribute('aria-label')).toBe('Cerrar carrito');
    cerrar.click();
    fixture.detectChanges();
    expect(host.closeLog).toEqual([true]);
  });

  it('en `page` no hay botón de cerrar aunque le den rótulo', () => {
    const { fixture, host } = mount();
    host.config.set({ ...CONFIG, closeLabel: 'Cerrar' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.syn-cart__close')).toBeNull();
  });

  // ─── dos en la misma página ─────────────────────────────────────────────────
  it('la página y el cajón no comparten el id del título', () => {
    const uno = TestBed.createComponent(Host);
    uno.detectChanges();
    const dos = TestBed.createComponent(Host);
    dos.detectChanges();

    const idUno = uno.nativeElement.querySelector('.syn-cart__heading')?.getAttribute('id');
    const idDos = dos.nativeElement.querySelector('.syn-cart__heading')?.getAttribute('id');
    expect(idUno).toBeTruthy();
    expect(idUno).not.toBe(idDos);
  });
});
