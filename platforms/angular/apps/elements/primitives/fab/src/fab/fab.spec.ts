import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FAB_SYNHOST } from '@synergos/contracts';
import { FabActivateDetail, FabElementComponent } from './fab';

describe('FabElementComponent', () => {
  let fixture: ComponentFixture<FabElementComponent>;
  let component: FabElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FabElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(FabElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with safe defaults and no tooltip (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.iconKey()).toBe('plus');
    expect(component.position()).toBe('bottom-right');
    expect(component.hasTooltip()).toBe(false);
    expect(component.isLink()).toBe(false);
    expect(component.iconPaths().length).toBeGreaterThan(0);
  });

  it('should resolve icon, position, link and tooltip from config (render+config case)', async () => {
    fixture.componentRef.setInput('iconKey', 'message');
    fixture.componentRef.setInput('position', 'top-left');
    fixture.componentRef.setInput('actionLink', 'https://wa.me/57300');
    fixture.componentRef.setInput('tooltip', 'Escríbenos');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.iconKey()).toBe('message');
    expect(component.position()).toBe('top-left');
    expect(component.isLink()).toBe(true);
    expect(component.target()).toBe('_blank');
    expect(component.rel()).toBe('noopener noreferrer');
    expect(component.hasTooltip()).toBe(true);
    expect(component.label()).toBe('Escríbenos');

    const anchor = (fixture.nativeElement as HTMLElement).querySelector('a.fab__trigger');
    expect(anchor).toBeTruthy();
    expect(anchor?.getAttribute('href')).toBe('https://wa.me/57300');
  });

  it('should emit fabactivate and toggle tooltip on interaction (interaction case)', async () => {
    fixture.componentRef.setInput('tooltip', 'Nueva acción');
    fixture.detectChanges();
    await fixture.whenStable();

    let detail: FabActivateDetail | undefined;
    component.fabactivate.subscribe((d) => (detail = d));

    component.openTooltip();
    expect(component.tooltipOpen()).toBe(true);

    component.activate();
    expect(detail).toEqual({ actionLink: '' });

    component.closeTooltip();
    expect(component.tooltipOpen()).toBe(false);
  });

  it('should let direct inputs override config and reject invalid position (idempotent precedence)', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"iconKey":"phone","position":"weird-corner","label":"Config label"}',
    );
    fixture.componentRef.setInput('label', 'Input label');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.iconKey()).toBe('phone');
    expect(component.position()).toBe('bottom-right');
    expect(component.label()).toBe('Input label');

    // Re-applying the same inputs yields the same resolved state (idempotent).
    fixture.componentRef.setInput('label', 'Input label');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.label()).toBe('Input label');
  });

  // CMS#192, caso 25: el icono es del set del design system y el editor elige de esa lista. Un
  // nombre que el set no tiene no viaja (el saneador lo cierra) y el botón conserva el suyo.
  it('pinta el icono del set por su nombre y uno que el set no tiene cae al de por defecto', async () => {
    fixture.componentRef.setInput('config', '{"iconKey":"shopping-cart"}');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.iconKey()).toBe('shopping-cart');
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('svg.fab__icon path').length).toBe(3);

    fixture.componentRef.setInput('config', '{"iconKey":"whatsapp"}');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.iconKey()).toBe('plus');
  });

  // CMS#192, caso 21: las dos centradas se podían elegir y caían abajo a la derecha.
  it('acepta las posiciones centradas', async () => {
    fixture.componentRef.setInput('position', 'top-center');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.position()).toBe('top-center');
    expect((fixture.nativeElement as HTMLElement).getAttribute('data-position')).toBe('top-center');
  });

  // D1: con `actionUrl`/`ariaLabel` —lo que mandaba la vista— el botón no llevaba a ningún sitio
  // y se anunciaba como «Acción». Éste alimenta el `config` EXACTO que emite hoy la vista del CMS.
  it('lleva al enlace del editor y se anuncia con su nombre con el config exacto que emite la vista del CMS', async () => {
    const { ejemplo } = FAB_SYNHOST;
    fixture.componentRef.setInput('config', JSON.stringify(ejemplo));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.isLink()).toBe(true);
    expect(component.actionLink()).toBe(ejemplo.actionLink);
    expect(component.target()).toBe(ejemplo.target);
    expect(component.label()).toBe(ejemplo.label);
    expect(component.position()).toBe(ejemplo.position);
    expect(component.iconKey()).toBe(ejemplo.iconKey);
    const anchor = (fixture.nativeElement as HTMLElement).querySelector('a.fab__trigger');
    expect(anchor?.getAttribute('aria-label')).toBe(ejemplo.label);
  });
});

/** El puente que publica la página (ADR 0136): sólo las claves que se pasan. */
function publicar(keys: Record<string, string>): void {
  (window as { synergos?: unknown }).synergos = { i18n: { culture: 'en-US', defaultCulture: 'es-CO', keys } };
}

describe('fab — microcopia del diccionario (ADR 0136, sección Fab)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FabElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  afterEach(() => {
    delete (window as { synergos?: unknown }).synergos;
  });

  it('el rótulo del editor gana; sin rótulo ni tooltip, el nombre es Fab.Aria', async () => {
    publicar({ 'Fab.Aria': 'Action' });
    const conRotulo = TestBed.createComponent(FabElementComponent);
    conRotulo.componentRef.setInput('config', JSON.stringify(FAB_SYNHOST.ejemplo));
    conRotulo.detectChanges();
    await conRotulo.whenStable();
    expect(conRotulo.componentInstance.label()).toBe(FAB_SYNHOST.ejemplo.label);

    const sinRotulo = TestBed.createComponent(FabElementComponent);
    sinRotulo.detectChanges();
    await sinRotulo.whenStable();
    expect(sinRotulo.componentInstance.label()).toBe('Action');
  });
});
