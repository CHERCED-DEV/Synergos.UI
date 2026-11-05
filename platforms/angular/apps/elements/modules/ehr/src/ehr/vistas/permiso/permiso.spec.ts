import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PermisoDeSalud, TEXTOS_DE_SALUD } from '@synergos/dominio/salud';
import { LiveRegionComponent } from '@synergos/shared';
import { textosDeSaludDelPortal } from '../../textos-de-salud';
import { SaludPermisoComponent } from './permiso';

/**
 * La vista del permiso de datos de salud (T051): pinta el texto que declara el CMS y AVISA la intención. Darlo o retirarlo
 * por la puerta lo prueba `ehr.spec.ts` con el coordinador (T050); aquí, lo que la vista enseña y lo que avisa.
 */
describe('La vista del permiso de datos de salud (T051)', () => {
  let fixture: ComponentFixture<SaludPermisoComponent>;
  let host: HTMLElement;

  function montar(modo: 'dar' | 'retirar', pedir = false): void {
    TestBed.configureTestingModule({
      imports: [SaludPermisoComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: TEXTOS_DE_SALUD, useFactory: textosDeSaludDelPortal },
        PermisoDeSalud,
      ],
    });
    fixture = TestBed.createComponent(SaludPermisoComponent);
    fixture.componentRef.setInput('modo', modo);
    fixture.componentRef.setInput('pedir', pedir);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  }

  const botones = (): HTMLButtonElement[] => Array.from(host.querySelectorAll('button'));

  afterEach(() => TestBed.resetTestingModule());

  it('al darlo, pinta el texto y «Autorizo» sólo cuando la puerta dijo que falta', () => {
    montar('dar');
    expect(host.querySelector('section')).toBeNull();
    expect(botones()).toEqual([]);

    fixture.componentRef.setInput('pedir', true);
    fixture.detectChanges();

    const seccion = host.querySelector('section');
    expect(seccion?.getAttribute('aria-label')).toBe('Autorización para tratar tus datos de salud');
    expect(seccion?.textContent).toContain('Son datos sensibles.');
    expect(seccion?.textContent).toContain('Política de tratamiento de datos');
    expect(botones().map((b) => b.textContent?.trim())).toEqual(['Autorizo']);
  });

  it('«Autorizo» avisa la intención y no ofrece retirarlo', () => {
    montar('dar', true);
    let aceptados = 0;
    let retirados = 0;
    fixture.componentInstance.aceptar.subscribe(() => (aceptados += 1));
    fixture.componentInstance.retirar.subscribe(() => (retirados += 1));

    botones()[0]!.click();

    expect(aceptados).toBe(1);
    expect(retirados).toBe(0);
  });

  it('al retirarlo, ofrece «Retirar mi autorización» sin el texto del permiso, y avisa la intención', () => {
    montar('retirar', true);
    let retirados = 0;
    fixture.componentInstance.retirar.subscribe(() => (retirados += 1));

    expect(host.querySelector('section')).toBeNull();
    expect(botones().map((b) => b.textContent?.trim())).toEqual(['Retirar mi autorización']);
    botones()[0]!.click();
    expect(retirados).toBe(1);
  });

  it('lo que quedó de la última acción sobre el permiso se dice, en los dos modos', () => {
    for (const modo of ['dar', 'retirar'] as const) {
      montar(modo);
      expect(fixture.debugElement.query(By.directive(LiveRegionComponent))).toBeNull();

      TestBed.inject(PermisoDeSalud).aviso.set('Diste tu autorización. Ya puedes agendar.');
      fixture.detectChanges();

      const region = fixture.debugElement.query(By.directive(LiveRegionComponent));
      expect((region?.componentInstance as LiveRegionComponent | undefined)?.message()).toBe(
        'Diste tu autorización. Ya puedes agendar.',
      );
      TestBed.resetTestingModule();
    }
  });

  it('mientras el permiso se mueve, el botón no se puede volver a pulsar', () => {
    montar('dar', true);
    TestBed.inject(PermisoDeSalud).moviendo.set(true);
    fixture.detectChanges();

    expect(botones()[0]?.disabled || botones()[0]?.getAttribute('aria-disabled') === 'true').toBe(true);
  });
});
