import { TestBed } from '@angular/core/testing';
import { COUNTDOWN_CLOCK_SYNHOST } from '@synergos/contracts';
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

  // D1: con `endDateTime` en el `config` —lo que mandaba la vista— el reloj decía «Fecha del evento
  // no disponible». Éste alimenta el `config` EXACTO que emite hoy la vista del CMS.
  it('cuenta hacia la fecha que escribió el editor con el config exacto que emite la vista del CMS', () => {
    const { ejemplo } = COUNTDOWN_CLOCK_SYNHOST;
    const fixture = TestBed.createComponent(CountdownClockElementComponent);
    fixture.componentRef.setInput('config', JSON.stringify(ejemplo));
    fixture.detectChanges();

    const componente = fixture.componentInstance;
    expect(componente.hasTarget()).toBe(true);
    expect(componente.targetMs()).toBe(Date.parse(ejemplo.targetDate ?? ''));
    expect(fixture.nativeElement.querySelector('.countdown-clock__invalid')).toBeNull();
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

  // ADR 0136: los dos relojes declaran la MISMA sección (`Countdown`) y piden las mismas claves.
  it('microcopia del diccionario: el hito, «empezó» y los rótulos salen de la sección Countdown', () => {
    (window as { synergos?: unknown }).synergos = {
      i18n: {
        culture: 'en-US',
        defaultCulture: 'es-CO',
        keys: {
          'Countdown.Milestone.Hour': 'Less than an hour to go.',
          'Countdown.Started': 'The concert has started',
          'Countdown.Days': 'Days',
        },
      },
    };
    try {
      const fixture = montar(3605);
      pasar(fixture, 6);
      expect(anuncios).toEqual(['Less than an hour to go.']);
      expect(fixture.componentInstance.labels().days).toBe('Days');
      // Lo que la página no publica sale por el respaldo es-CO, nunca la clave cruda.
      expect(fixture.componentInstance.labels().hours).toBe('Horas');

      // `montar` cuenta desde AHORA y el reloj falso ya avanzó 6 s: 68 deja 62 s al montar.
      anuncios.length = 0;
      const otro = montar(68);
      pasar(otro, 63);
      expect(anuncios).toEqual(['Falta menos de un minuto.', 'The concert has started']);
    } finally {
      delete (window as { synergos?: unknown }).synergos;
    }
  });
});
