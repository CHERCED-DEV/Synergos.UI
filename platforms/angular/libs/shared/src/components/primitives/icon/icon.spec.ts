import { TestBed } from '@angular/core/testing';
import { IconComponent } from './icon';
import { NOMBRES_DE_ICONO, trazosDeIcono } from './icon-set';

describe(IconComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IconComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(IconComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the provided symbol', () => {
    const fixture = TestBed.createComponent(IconComponent);
    fixture.componentRef.setInput('symbol', '+');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.trim()).toBe('+');
  });

  // UI#89: con un nombre y sin glifo pintaba la PALABRA («check Envío gratis…»).
  it('pinta el icono del set por su nombre, como SVG y sin la palabra', () => {
    const fixture = TestBed.createComponent(IconComponent);
    fixture.componentRef.setInput('name', 'check');
    fixture.detectChanges();

    const svg = fixture.nativeElement.querySelector('svg.syn-icon__svg') as SVGElement | null;
    expect(svg).toBeTruthy();
    expect(svg?.querySelectorAll('path').length).toBe(1);
    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('un nombre que el set no tiene no se pinta como palabra: cae al glifo, y sin glifo no hay nada', () => {
    const fixture = TestBed.createComponent(IconComponent);
    fixture.componentRef.setInput('name', 'no-existe');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent.trim()).toBe('');
    expect(fixture.nativeElement.querySelector('svg')).toBeNull();

    fixture.componentRef.setInput('symbol', '✓');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent.trim()).toBe('✓');
  });

  it('cada icono del set tiene al menos un trazo y su nombre va en minúscula con guiones', () => {
    for (const nombre of NOMBRES_DE_ICONO) {
      expect(nombre).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(trazosDeIcono(nombre)?.length).toBeGreaterThan(0);
    }
    expect(NOMBRES_DE_ICONO.length).toBeGreaterThanOrEqual(40);
    expect(trazosDeIcono(' CHECK ')).toEqual(trazosDeIcono('check'));
  });

  it('sets accessible labelling when not decorative', () => {
    const fixture = TestBed.createComponent(IconComponent);
    fixture.componentRef.setInput('symbol', 'i');
    fixture.componentRef.setInput('label', 'Information');
    fixture.componentRef.setInput('decorative', false);
    fixture.detectChanges();

    const icon = fixture.nativeElement.querySelector('.syn-icon') as HTMLElement;
    expect(icon.getAttribute('aria-label')).toBe('Information');
  });
});
