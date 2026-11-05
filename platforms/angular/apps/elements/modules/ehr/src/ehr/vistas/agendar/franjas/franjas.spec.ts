import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { LiveRegionComponent } from '@synergos/shared';
import { SaludFranjasComponent, type DiaDeLaAgenda, type HoraElegida } from './franjas';

/** Un lunes de 2027 con dos horas libres, y el martes con una. */
const DIAS: readonly DiaDeLaAgenda[] = [
  { fecha: '2027-03-15', etiqueta: 'lun, 15 mar', horas: ['09:00', '09:40'] },
  { fecha: '2027-03-16', etiqueta: 'mar, 16 mar', horas: ['10:00'] },
];

/**
 * La vista de las franjas (T051): los días y sus horas, cada una un `syn-button` con su estado. Qué horas hay lo prueba
 * `ehr.spec.ts` (T046, la agenda por la puerta); aquí, lo que la vista enseña y lo que avisa.
 */
describe('La vista de las franjas del asistente (T051)', () => {
  let fixture: ComponentFixture<SaludFranjasComponent>;
  let host: HTMLElement;

  function montar(dias: readonly DiaDeLaAgenda[], elegida: HoraElegida | null = null, aviso: string | null = null): void {
    TestBed.configureTestingModule({ imports: [SaludFranjasComponent], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(SaludFranjasComponent);
    fixture.componentRef.setInput('dias', dias);
    fixture.componentRef.setInput('elegida', elegida);
    fixture.componentRef.setInput('aviso', aviso);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  }

  const botones = (): HTMLButtonElement[] => Array.from(host.querySelectorAll('button'));

  afterEach(() => TestBed.resetTestingModule());

  it('pinta cada día con sus horas, en orden', () => {
    montar(DIAS);

    expect(Array.from(host.querySelectorAll('.salud-franjas__fecha')).map((p) => p.textContent?.trim())).toEqual([
      'lun, 15 mar',
      'mar, 16 mar',
    ]);
    expect(botones().map((b) => b.textContent?.trim())).toEqual(['09:00', '09:40', '10:00']);
  });

  it('la hora elegida se OYE, no sólo se ve: cada hora es un botón con aria-pressed', () => {
    montar(DIAS, { date: '2027-03-15', time: '09:40' });

    expect(botones().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
  });

  it('la misma hora de otro día no cuenta como elegida', () => {
    montar([...DIAS, { fecha: '2027-03-17', etiqueta: 'mié, 17 mar', horas: ['09:40'] }], { date: '2027-03-15', time: '09:40' });

    expect(botones().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false']);
  });

  it('elegir una hora la avisa con su día', () => {
    montar(DIAS);
    const elegidas: HoraElegida[] = [];
    fixture.componentInstance.elegir.subscribe((hora) => elegidas.push(hora));

    botones()[2]!.click();

    expect(elegidas).toEqual([{ date: '2027-03-16', time: '10:00' }]);
  });

  it('sin horas no ofrece ninguna, y dice el aviso de la agenda', () => {
    montar([], null, 'Este profesional no tiene horas libres en los próximos días.');

    expect(botones()).toEqual([]);
    const region = fixture.debugElement.query(By.directive(LiveRegionComponent));
    expect((region?.componentInstance as LiveRegionComponent | undefined)?.message()).toBe(
      'Este profesional no tiene horas libres en los próximos días.',
    );
  });

  it('sin aviso no hay región que hable', () => {
    montar(DIAS);

    expect(fixture.debugElement.query(By.directive(LiveRegionComponent))).toBeNull();
  });
});
