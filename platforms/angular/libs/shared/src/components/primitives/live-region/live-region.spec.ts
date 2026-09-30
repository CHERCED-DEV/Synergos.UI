import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LiveRegionComponent } from './live-region';

/**
 * La fachada declarativa del anunciador (#82).
 *
 * Los tres casos de antes —se crea, pinta el texto, variante visible— pasaban igual con una
 * región que nunca anunciaba nada. Acá se mira la región del DOCUMENTO, que es por donde habla.
 */
@Component({
  standalone: true,
  imports: [LiveRegionComponent],
  template: `
    <syn-live-region [message]="hito()" [politeness]="cortesia()" />
    @if (aviso(); as texto) {
      <syn-live-region [message]="texto" announceInitial />
    }
  `,
})
class Host {
  readonly hito = signal('');
  readonly cortesia = signal<'polite' | 'assertive'>('polite');
  readonly aviso = signal('');
}

/** Un valor que ya está al montar: el contenido de la carga. */
@Component({
  standalone: true,
  imports: [LiveRegionComponent],
  template: `<syn-live-region message="Ya estaba" />`,
})
class HostConValorInicial {}

@Component({
  standalone: true,
  imports: [LiveRegionComponent],
  template: `<syn-live-region message="Filtros aplicados" [visuallyHidden]="false" tone="brand" />`,
})
class HostVisible {}

const region = (): HTMLElement | null => document.querySelector('[data-syn-live-announcer]');

describe(LiveRegionComponent.name, () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ imports: [Host, HostConValorInicial, HostVisible] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function montar() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return { fixture, host: fixture.componentInstance };
  }

  it('no pinta una región propia: habla por la del documento, que ya existía', () => {
    const { fixture } = montar();
    expect(fixture.nativeElement.querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull();
    expect(region()).not.toBeNull();
    expect(region()?.textContent).toBe('');
  });

  it('anuncia cuando CAMBIA el mensaje', () => {
    const { fixture, host } = montar();
    host.hito.set('Falta menos de una hora.');
    fixture.detectChanges();
    vi.advanceTimersByTime(100);
    expect(region()?.textContent).toBe('Falta menos de una hora.');
  });

  it('el primer valor es contenido de la carga y no se anuncia', () => {
    const fixture = TestBed.createComponent(HostConValorInicial);
    fixture.detectChanges();
    vi.advanceTimersByTime(200);
    expect(region()?.textContent).toBe('');
  });

  it('dentro de un @if, con announceInitial, el mensaje con el que nace SÍ se anuncia', () => {
    // Es el caso que el inline no resuelve: la región nace con su texto y calla. Acá la región
    // es la del documento, que existe desde antes.
    const { fixture, host } = montar();
    host.aviso.set('No se pudo guardar.');
    fixture.detectChanges();
    vi.advanceTimersByTime(100);
    expect(region()?.textContent).toBe('No se pudo guardar.');
  });

  it('respeta la cortesía', () => {
    const { fixture, host } = montar();
    host.cortesia.set('assertive');
    host.hito.set('Se venció el apartado.');
    fixture.detectChanges();
    vi.advanceTimersByTime(100);
    expect(region()?.getAttribute('aria-live')).toBe('assertive');
  });

  it('un mensaje vacío no se anuncia, y cambiar sólo la cortesía no repite', () => {
    const { fixture, host } = montar();
    host.hito.set('Uno');
    fixture.detectChanges();
    vi.advanceTimersByTime(3000);
    expect(region()?.textContent).toBe('');

    host.cortesia.set('assertive');
    fixture.detectChanges();
    host.hito.set('   ');
    fixture.detectChanges();
    vi.advanceTimersByTime(200);
    expect(region()?.textContent).toBe('');
  });

  it('visible: pinta el texto como contenido normal, no como región viva', () => {
    const fixture = TestBed.createComponent(HostVisible);
    fixture.detectChanges();
    const texto = fixture.nativeElement.querySelector('.syn-live-region') as HTMLElement;
    expect(texto.textContent?.trim()).toBe('Filtros aplicados');
    expect(texto.className).toContain('syn-live-region--brand');
    expect(texto.hasAttribute('aria-live')).toBe(false);
    expect(texto.hasAttribute('role')).toBe(false);
  });
});
