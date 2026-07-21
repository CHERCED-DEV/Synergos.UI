import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ButtonContainerComponent } from './button-container';

describe('ButtonContainerComponent', () => {
  let fixture: ComponentFixture<ButtonContainerComponent>;
  let component: ButtonContainerComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ButtonContainerComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(ButtonContainerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ── Alcanzabilidad de `loading` ────────────────────────────────────────────
  //
  // Estos tests existen por un defecto concreto, no por completismo. El estado de
  // carga del botón se construyó entero —mixin, input, 13 tests— y quedó
  // INALCANZABLE: este puente, que es el único camino desde el CMS, no lo exponía.
  // El único activador en todo el repo era un fichero de tests. Una capacidad que
  // solo se puede encender desde su propia suite no existe para el producto, y 13
  // tests verdes alrededor la camuflan.
  //
  // La red que faltaba no es "¿el botón sabe cargar?" sino "¿alguien de fuera puede
  // pedírselo?". Eso es lo que se afirma aquí.

  it('expone loading a través del config del CMS (alcanzabilidad)', () => {
    fixture.componentRef.setInput('config', { label: 'Guardar', loading: true });
    fixture.detectChanges();

    expect(component.loading()).toBe(true);
    const btn = fixture.nativeElement.querySelector('syn-button');
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('aria-busy') ?? btn.querySelector('[aria-busy]')).toBeTruthy();
  });

  it('expone loading también por el alias plano', () => {
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    expect(component.loading()).toBe(true);
  });

  it('en reposo no está cargando', () => {
    fixture.componentRef.setInput('config', { label: 'Guardar' });
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
  });

  // El enlace NO recibe loading, y es deliberado: un <a> navega en vez de ejecutar
  // una acción en sitio, y el texto sr-only del estado de carga se plegaría al
  // nombre accesible del ancestro ("Guardar Cargando").
  it('la rama de ENLACE no propaga loading', () => {
    fixture.componentRef.setInput('config', {
      label: 'Guardar',
      href: 'https://example.co',
      loading: true,
    });
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('a.button-container__link');
    expect(link).toBeTruthy();
    expect(link.querySelector('syn-button')?.getAttribute('ng-reflect-loading') ?? null).not.toBe('true');
  });

  // ── Vocabulario de variantes del CMS ───────────────────────────────────────
  //
  // Este contenedor estrechaba el vocabulario a solid|outline|ghost y aplanaba a
  // `solid` todo lo demás. Como el CMS publica primary|secondary|ghost|outlined|
  // neutral|emphasis, un botón `secondary` se volvía primario AL HIDRATAR: el
  // respaldo SSR pintaba syn-button--secondary y el elemento pintaba solid.
  // Se afirma el mapeo completo, no sólo el caso que se reportó.

  it.each([
    ['primary', 'solid'],
    ['secondary', 'outline'],
    ['outlined', 'outline'],
    ['ghost', 'ghost'],
    ['neutral', 'ghost'],
    ['emphasis', 'gradient'],
    // El vocabulario propio del elemento sigue funcionando.
    ['solid', 'solid'],
    ['outline', 'outline'],
    ['gradient', 'gradient'],
    ['danger', 'danger'],
    // Tolerancia a lo que llega por atributo DOM.
    ['  Secondary  ', 'outline'],
  ])('normaliza la variante %s del CMS a %s', (input, expected) => {
    fixture.componentRef.setInput('config', { label: 'X', variant: input });
    fixture.detectChanges();

    expect(component.resolvedVariant()).toBe(expected);
  });

  // Control: si esto pasara, el test de arriba no probaría nada — un mapeo que
  // acepta cualquier cosa no es un mapeo.
  it('cae a solid ante una variante desconocida', () => {
    fixture.componentRef.setInput('config', { label: 'X', variant: 'xxnoexiste' });
    fixture.detectChanges();

    expect(component.resolvedVariant()).toBe('solid');
  });
});
