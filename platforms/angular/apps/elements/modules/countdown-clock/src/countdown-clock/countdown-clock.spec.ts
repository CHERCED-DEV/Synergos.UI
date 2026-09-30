import { TestBed } from '@angular/core/testing';
import { LiveAnnouncerService } from '@synergos/shared';
import { CountdownClockElementComponent } from './countdown-clock';

/**
 * El reloj habla por HITOS, no por tics (#82).
 *
 * Este elemento no tenía spec. El defecto era una `<p aria-live="polite">` con la frase del tiempo
 * restante, que incluye los segundos: un lector de pantalla la anunciaba cada segundo mientras la
 * página estuviera abierta. Un spec que buscara `[aria-live]` la encontraba y daba el reloj por
 * accesible — lo que hay que medir es CUÁNTAS VECES habla.
 */
const AHORA = new Date('2026-09-29T10:00:00Z');
const enSegundos = (s: number): string => new Date(AHORA.getTime() + s * 1000).toISOString();

describe('countdown-clock — anuncios', () => {
  let anuncios: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
    TestBed.configureTestingModule({ imports: [CountdownClockElementComponent] });
    anuncios = [];
    vi.spyOn(TestBed.inject(LiveAnnouncerService), 'announce').mockImplementation((m) => {
      anuncios.push(m);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function montar(segundos: number) {
    const fixture = TestBed.createComponent(CountdownClockElementComponent);
    fixture.componentRef.setInput('targetDate', enSegundos(segundos));
    fixture.detectChanges();
    return fixture;
  }

  function pasar(fixture: ReturnType<typeof montar>, segundos: number): void {
    for (let i = 0; i < segundos; i += 1) {
      vi.advanceTimersByTime(1000);
      fixture.detectChanges();
    }
  }

  it('no hay región viva en su plantilla: el reloj se describe (role=timer), no se anuncia', () => {
    const fixture = montar(3605);
    const vivas = fixture.nativeElement.querySelectorAll(
      '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]',
    );
    expect(vivas.length).toBe(0);
    expect(fixture.nativeElement.querySelector('[role="timer"]')?.getAttribute('aria-label')).toContain('Horas');
  });

  it('diez segundos de reloj son CERO anuncios', () => {
    const fixture = montar(3605 + 20);
    pasar(fixture, 10);
    expect(anuncios).toEqual([]);
  });

  it('cruzar la hora se dice UNA vez, y los tics de después no repiten', () => {
    const fixture = montar(3603);
    pasar(fixture, 2);
    expect(anuncios).toEqual([]);

    pasar(fixture, 1);
    expect(anuncios).toEqual(['Falta menos de una hora.']);

    pasar(fixture, 30);
    expect(anuncios).toEqual(['Falta menos de una hora.']);
  });

  it('el hito de la carga no se anuncia: abrir la página a 3 h del evento no dice nada', () => {
    const fixture = montar(3 * 3600);
    pasar(fixture, 3);
    expect(anuncios).toEqual([]);
  });

  it('al llegar a cero dice que empezó, con el rótulo del editor', () => {
    const fixture = TestBed.createComponent(CountdownClockElementComponent);
    fixture.componentRef.setInput('targetDate', enSegundos(62));
    fixture.componentRef.setInput('startedLabel', 'Arrancó el concierto');
    fixture.detectChanges();

    pasar(fixture, 2);
    expect(anuncios).toEqual(['Falta menos de un minuto.']);
    pasar(fixture, 61);
    expect(anuncios).toEqual(['Falta menos de un minuto.', 'Arrancó el concierto']);
    expect(fixture.nativeElement.querySelector('.countdown-clock__started')?.textContent).toContain(
      'Arrancó el concierto',
    );
  });

  it('una fecha que no se entiende no anuncia nada y no es una región viva', () => {
    const fixture = TestBed.createComponent(CountdownClockElementComponent);
    fixture.componentRef.setInput('targetDate', 'pronto');
    fixture.detectChanges();
    pasar(fixture, 2);

    expect(anuncios).toEqual([]);
    const aviso = fixture.nativeElement.querySelector('.countdown-clock__invalid') as HTMLElement;
    expect(aviso.textContent).toContain('Fecha del evento no disponible');
    expect(aviso.hasAttribute('role')).toBe(false);
  });
});
