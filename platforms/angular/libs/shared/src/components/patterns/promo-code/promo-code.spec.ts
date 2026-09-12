import { Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  PromoCodeComponent,
  type AppliedPromo,
  type PromoCodeConfig,
  type PromoRejection,
} from './promo-code';

/**
 * El campo de cupón (#29).
 *
 * Lo que de verdad guardan estos casos: que **no se pueda mandar dos veces el
 * mismo código** —la forma más simple de que el servidor aplique dos descuentos—
 * y que cada motivo de rechazo diga algo distinto, porque cada uno pide una
 * acción distinta de quien compra.
 */

@Component({
  standalone: true,
  imports: [PromoCodeComponent],
  template: `
    <syn-promo-code
      [config]="config()"
      [applied]="applied()"
      [busy]="busy()"
      [rejection]="rejection()"
      [rejectionDetail]="detail()"
      (apply)="applyLog.push($event)"
      (remove)="removeLog.push($event)"
    />
  `,
})
class Host {
  readonly control = viewChild.required(PromoCodeComponent);
  readonly config = signal<PromoCodeConfig>({});
  readonly applied = signal<AppliedPromo | null>(null);
  readonly busy = signal(false);
  readonly rejection = signal<PromoRejection | null>(null);
  readonly detail = signal('');
  readonly applyLog: string[] = [];
  readonly removeLog: string[] = [];
}

function mount(): { fixture: ReturnType<typeof TestBed.createComponent<Host>>; host: Host } {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

const texto = (fixture: { nativeElement: HTMLElement }, sel: string): string =>
  (fixture.nativeElement.querySelector(sel)?.textContent ?? '').trim();

function escribir(fixture: { nativeElement: HTMLElement }, valor: string): void {
  const input = fixture.nativeElement.querySelector('.syn-promo__input') as HTMLInputElement;
  input.value = valor;
  input.dispatchEvent(new Event('input'));
}

describe('syn-promo-code', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  // ─── vacío ──────────────────────────────────────────────────────────────────
  it('nace con el campo vacío y sin poder aplicar', () => {
    const { fixture } = mount();
    const boton = fixture.nativeElement.querySelector('.syn-promo__apply') as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.syn-promo__error')).toBeNull();
  });

  // ─── feliz ──────────────────────────────────────────────────────────────────
  it('aplica el código en MAYÚSCULAS y sin espacios', () => {
    const { fixture, host } = mount();
    escribir(fixture, '  bienvenida10  ');
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.syn-promo__apply') as HTMLButtonElement).click();
    fixture.detectChanges();

    // Los códigos se dictan por teléfono y se pegan de un correo: uno que falla
    // por la caja es un cupón que la gente cree vencido.
    expect(host.applyLog).toEqual(['BIENVENIDA10']);
  });

  it('con un cupón aplicado el campo DESAPARECE y queda el «quitar»', () => {
    const { fixture, host } = mount();
    host.applied.set({
      code: 'BIENVENIDA10',
      discountLabel: '−$24.000',
      detail: 'Válido hasta el 30 de septiembre',
    });
    fixture.detectChanges();

    // Dejar el campo invitaría a mandar el mismo código otra vez.
    expect(fixture.nativeElement.querySelector('.syn-promo__form')).toBeNull();
    expect(texto(fixture, '.syn-promo__applied-code')).toBe('BIENVENIDA10');
    expect(texto(fixture, '.syn-promo__applied-amount')).toBe('−$24.000');
    expect(texto(fixture, '.syn-promo__applied-detail')).toContain('30 de septiembre');

    (fixture.nativeElement.querySelector('.syn-promo__remove') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.removeLog).toEqual(['BIENVENIDA10']);
  });

  // ─── EL caso: no mandar dos veces lo mismo ──────────────────────────────────
  it('con una consulta en vuelo NO se puede volver a aplicar', () => {
    const { fixture, host } = mount();
    escribir(fixture, 'BIENVENIDA10');
    fixture.detectChanges();

    host.busy.set(true);
    fixture.detectChanges();

    const boton = fixture.nativeElement.querySelector('.syn-promo__apply') as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(boton.textContent?.trim()).toBe('Validando…');

    // Y el envío del formulario tampoco cuela: mandar dos veces el mismo cupón es
    // la forma más simple de que el servidor aplique dos descuentos.
    (fixture.nativeElement.querySelector('.syn-promo__form') as HTMLFormElement).dispatchEvent(
      new Event('submit'),
    );
    fixture.detectChanges();
    expect(host.applyLog).toEqual([]);
  });

  it('quitar tampoco se puede mientras hay algo en vuelo', () => {
    const { fixture, host } = mount();
    host.applied.set({ code: 'X', discountLabel: '−$1' });
    host.busy.set(true);
    fixture.detectChanges();

    expect(
      (fixture.nativeElement.querySelector('.syn-promo__remove') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  // ─── EL caso: cada motivo dice lo suyo ──────────────────────────────────────
  it('cada motivo de rechazo tiene su mensaje', () => {
    const { fixture, host } = mount();
    const esperado: Array<[PromoRejection, string]> = [
      ['unknown', 'bien escrito'],
      ['expired', 'venció'],
      ['minimum-not-met', 'mínimo'],
      ['not-applicable', 'no aplica'],
      ['already-used', 'ya se usó'],
      ['failed', 'Intenta de nuevo'],
    ];
    for (const [motivo, fragmento] of esperado) {
      host.rejection.set(motivo);
      fixture.detectChanges();
      expect(texto(fixture, '.syn-promo__error')).toContain(fragmento);
    }
  });

  it('`minimum-not-met` puede decir CUÁNTO falta, que es lo único accionable', () => {
    const { fixture, host } = mount();
    host.rejection.set('minimum-not-met');
    host.detail.set('Te faltan $12.000.');
    fixture.detectChanges();

    expect(texto(fixture, '.syn-promo__error')).toContain('Te faltan $12.000.');
  });

  it('el dominio puede reescribir cualquier mensaje', () => {
    const { fixture, host } = mount();
    host.config.set({ messages: { expired: 'Esa promo de lanzamiento ya cerró.' } });
    host.rejection.set('expired');
    fixture.detectChanges();

    expect(texto(fixture, '.syn-promo__error')).toBe('Esa promo de lanzamiento ya cerró.');
  });

  it('el error se anuncia y el campo queda marcado como inválido', () => {
    const { fixture, host } = mount();
    host.rejection.set('unknown');
    fixture.detectChanges();

    const error = fixture.nativeElement.querySelector('.syn-promo__error');
    expect(error?.getAttribute('role')).toBe('alert');
    const input = fixture.nativeElement.querySelector('.syn-promo__input') as HTMLInputElement;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(error?.getAttribute('id'));
  });

  // ─── idempotente ────────────────────────────────────────────────────────────
  it('pulsar aplicar dos veces con el mismo texto emite dos veces — lo corta el dominio', () => {
    const { fixture, host } = mount();
    escribir(fixture, 'X10');
    fixture.detectChanges();
    const boton = fixture.nativeElement.querySelector('.syn-promo__apply') as HTMLButtonElement;

    boton.click();
    // El dominio marca `busy` en el mismo tick; sin eso, el control no puede saber
    // que hay una consulta en vuelo.
    host.busy.set(true);
    fixture.detectChanges();
    boton.click();
    fixture.detectChanges();

    expect(host.applyLog).toEqual(['X10']);
  });

  it('`clear()` vacía el campo — lo llama el dominio cuando el servidor aceptó', () => {
    const { fixture, host } = mount();
    escribir(fixture, 'X10');
    fixture.detectChanges();
    expect(host.control().code()).toBe('X10');

    host.control().clear();
    fixture.detectChanges();
    expect(host.control().code()).toBe('');
  });

  // ─── dos en la misma página ─────────────────────────────────────────────────
  it('dos controles no comparten el id del campo', () => {
    const uno = TestBed.createComponent(Host);
    uno.detectChanges();
    const dos = TestBed.createComponent(Host);
    dos.detectChanges();

    const idUno = uno.nativeElement.querySelector('.syn-promo__input')?.getAttribute('id');
    const idDos = dos.nativeElement.querySelector('.syn-promo__input')?.getAttribute('id');
    expect(idUno).toBeTruthy();
    expect(idUno).not.toBe(idDos);
  });
});
