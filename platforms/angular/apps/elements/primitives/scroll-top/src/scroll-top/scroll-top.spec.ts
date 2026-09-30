import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SCROLL_TOP_SYNHOST } from '@synergos/contracts';
import { ScrollTopElementComponent } from './scroll-top';

describe('ScrollTopElementComponent', () => {
  let fixture: ComponentFixture<ScrollTopElementComponent>;
  let component: ScrollTopElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ScrollTopElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(ScrollTopElementComponent);
    component = fixture.componentInstance;
    window.scrollTo(0, 0);
    fixture.detectChanges();
  });

  it('should create with safe defaults and start hidden (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.threshold()).toBe(320);
    expect(component.position()).toBe('bottom-right');
    expect(component.label()).toBe('Volver arriba');
    expect(component.visible()).toBe(false);
  });

  it('should resolve config + attribute overrides (render+config case)', async () => {
    fixture.componentRef.setInput('config', '{"scrollThreshold":100,"position":"bottom-left","label":"Config label"}');
    fixture.componentRef.setInput('label', 'Input label');
    fixture.detectChanges();
    await fixture.whenStable();

    // config supplies threshold/position; explicit attribute wins for label.
    expect(component.threshold()).toBe(100);
    expect(component.position()).toBe('bottom-left');
    expect(component.label()).toBe('Input label');
  });

  // D1: con `ariaLabel` —lo que mandaba la vista— el botón decía siempre «Volver arriba». Éste
  // alimenta el `config` EXACTO que emite hoy la vista del CMS.
  it('pinta el nombre accesible que escribió el editor con el config exacto que emite la vista del CMS', async () => {
    const { ejemplo } = SCROLL_TOP_SYNHOST;
    fixture.componentRef.setInput('config', JSON.stringify(ejemplo));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.label()).toBe(ejemplo.label);
    expect(component.threshold()).toBe(ejemplo.scrollThreshold);
    expect(component.position()).toBe(ejemplo.position);
    const boton = (fixture.nativeElement as HTMLElement).querySelector('button');
    expect(boton?.getAttribute('aria-label')).toBe(ejemplo.label);
  });

  it('should emit scrolltotop and scroll the window on activate (interaction case)', async () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    let emitted = 0;
    component.scrolltotop.subscribe(() => emitted++);

    component.scrollToTop();

    expect(emitted).toBe(1);
    expect(scrollToSpy).toHaveBeenCalledWith(
      expect.objectContaining({ top: 0 }),
    );
    scrollToSpy.mockRestore();
  });

  it('should compute visibility deterministically from scroll offset (idempotent case)', () => {
    const scrollYSpy = vi.spyOn(window, 'scrollY', 'get').mockReturnValue(50);
    component.evaluateVisibility();
    expect(component.visible()).toBe(false); // below default threshold 320

    scrollYSpy.mockReturnValue(500);
    component.evaluateVisibility();
    component.evaluateVisibility(); // repeated call → same state, no drift
    expect(component.visible()).toBe(true);

    scrollYSpy.mockRestore();
  });
});
