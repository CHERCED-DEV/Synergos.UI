import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SearchBoxElementComponent, navegacion } from './search-box';

describe('SearchBoxElementComponent', () => {
  let fixture: ComponentFixture<SearchBoxElementComponent>;
  let component: SearchBoxElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchBoxElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(SearchBoxElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with sensible defaults (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.placeholder()).toBe('Buscar…');
    expect(component.suggestions()).toEqual([]);
  });

  // CMS#196, tanda D: del CMS sólo llega lo que declara SearchBoxProps; lo demás, por atributo.
  it('should read the CMS config and keep the rest as attributes (happy case)', async () => {
    fixture.componentRef.setInput('config', '{"placeholder":"Buscar propiedad","minChars":2}');
    fixture.componentRef.setInput('suggestions', '["Polanco","Condesa"]');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.placeholder()).toBe('Buscar propiedad');
    expect(component.minChars()).toBe(0);
    expect(component.suggestions().map((s) => s.label)).toEqual(['Polanco', 'Condesa']);
  });

  // CMS#196, tanda D: con submitToPage, buscar recarga la página con ?q para el listado de al lado.
  it('con submitToPage, buscar recarga la página con ?q, y vaciar la quita', async () => {
    const ir = vi.spyOn(navegacion, 'ir').mockImplementation(() => undefined);
    fixture.componentRef.setInput('config', { submitToPage: true });
    fixture.detectChanges();
    await fixture.whenStable();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    input.value = 'Chicó Norte';
    input.dispatchEvent(new Event('input'));
    (input.form as HTMLFormElement).requestSubmit(); // lo que hace el navegador con Enter
    expect(new URL(ir.mock.calls[0][0]).searchParams.get('q')).toBe('Chicó Norte');

    input.value = '';
    input.dispatchEvent(new Event('input'));
    (input.form as HTMLFormElement).requestSubmit(); // lo que hace el navegador con Enter
    expect(new URL(ir.mock.calls[1][0]).searchParams.has('q')).toBe(false);
    ir.mockRestore();
  });

  it('sin submitToPage, buscar no navega: sólo avisa por sus eventos', async () => {
    const ir = vi.spyOn(navegacion, 'ir').mockImplementation(() => undefined);
    const enviados: string[] = [];
    component.submitted.subscribe((q) => enviados.push(q));
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    input.value = 'jazz';
    input.dispatchEvent(new Event('input'));
    (input.form as HTMLFormElement).requestSubmit(); // lo que hace el navegador con Enter

    expect(enviados).toEqual(['jazz']);
    expect(ir).not.toHaveBeenCalled();
    ir.mockRestore();
  });

  it('should let direct inputs override config', async () => {
    fixture.componentRef.setInput('config', '{"placeholder":"Config placeholder"}');
    fixture.componentRef.setInput('placeholder', 'Input placeholder');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.placeholder()).toBe('Input placeholder');
  });

  it('should filter suggestions by the live query', async () => {
    fixture.componentRef.setInput('suggestions', '["Polanco","Condesa","Roma Norte"]');
    fixture.detectChanges();
    await fixture.whenStable();

    component.query.set('po');
    expect(component.filteredSuggestions().map((s) => s.label)).toEqual(['Polanco']);
  });

  it('should emit search and submitted on commit, debounce disabled', () => {
    fixture.componentRef.setInput('debounceMs', 0);
    fixture.detectChanges();

    const searches: string[] = [];
    const submits: string[] = [];
    component.querychange.subscribe((value) => searches.push(value));
    component.submitted.subscribe((value) => submits.push(value));

    component.query.set('  centro  ');
    component.onSubmit(new Event('submit'));

    expect(searches).toContain('centro');
    expect(submits).toEqual(['centro']);
  });
});
