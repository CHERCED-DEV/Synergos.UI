import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { CitaLeida } from '@synergos/dominio/salud';
import { SaludCitaDelEnlaceComponent } from './cita-del-enlace';

/** La cita como la deja `leerCita` con lo que contesta el servidor: pendiente, con su franja y su total. */
const PENDIENTE: CitaLeida = {
  id: 'cita-77',
  numero: 'SAL-0077',
  estado: 'Running',
  profesionalId: 'doc-mendez',
  ventana: { start: '2026-08-01T15:00:00Z', end: '2026-08-01T15:30:00Z' },
  total: { amount: 50_000, currency: 'COP' },
  deshaciendo: false,
};

/**
 * La vista de la cita del enlace del aviso (T051): pinta lo que contestó el servidor y lo que la app trae escrito, y sólo
 * ofrece «Cancelar cita» a una pendiente. Abrir el enlace y cancelarla por la puerta lo prueba `ehr.spec.ts` (T030, T031).
 */
describe('La vista de la cita del enlace (T051)', () => {
  let fixture: ComponentFixture<SaludCitaDelEnlaceComponent>;
  let host: HTMLElement;

  function montar(cita: CitaLeida, escrito: { profesional?: string; hora?: string; importe?: string } = {}): void {
    TestBed.configureTestingModule({ imports: [SaludCitaDelEnlaceComponent], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(SaludCitaDelEnlaceComponent);
    fixture.componentRef.setInput('cita', cita);
    for (const [nombre, valor] of Object.entries(escrito)) {
      fixture.componentRef.setInput(nombre, valor);
    }
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  }

  const textos = (): string[] => Array.from(host.querySelectorAll('h2, p')).map((nodo) => nodo.textContent?.trim() ?? '');
  const cancelar = (): HTMLButtonElement | undefined =>
    Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Cancelar cita');

  afterEach(() => TestBed.resetTestingModule());

  it('pinta su número, su estado y lo que la app trae escrito: el profesional, la hora y el total', () => {
    montar(PENDIENTE, { profesional: 'Dra. Laura Méndez', hora: 'sáb, 1 ago · 10:00', importe: '$ 50.000' });

    expect(textos()).toEqual(['Tu cita SAL-0077', 'Pendiente de confirmar', 'Dra. Laura Méndez', 'sáb, 1 ago · 10:00', '$ 50.000']);
  });

  it('no nombra un profesional, una hora ni un total que la app no conoce', () => {
    montar(PENDIENTE);

    expect(textos()).toEqual(['Tu cita SAL-0077', 'Pendiente de confirmar']);
  });

  it('sólo una pendiente ofrece «Cancelar cita», y cancelar avisa su id', () => {
    montar(PENDIENTE);
    const pedidas: string[] = [];
    fixture.componentInstance.cancelar.subscribe((id) => pedidas.push(id));

    cancelar()!.click();

    expect(pedidas).toEqual(['cita-77']);
  });

  it('una confirmada, una deshecha o una en revisión no ofrecen «Cancelar cita»', () => {
    for (const [estado, dice] of [
      ['Completed', 'Confirmada'],
      ['Compensated', 'No quedó agendada'],
      ['Stuck', 'En revisión'],
    ] as const) {
      montar({ ...PENDIENTE, estado });

      expect(textos()).toContain(dice);
      expect(cancelar()).toBeUndefined();
      TestBed.resetTestingModule();
    }
  });
});
