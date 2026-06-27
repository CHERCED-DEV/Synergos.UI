import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SearchBoxElementComponent } from './search-box';

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

  it('should read config payloads (happy case)', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"placeholder":"Buscar propiedad","minChars":2,"suggestions":["Polanco","Condesa"]}',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.placeholder()).toBe('Buscar propiedad');
    expect(component.minChars()).toBe(2);
    expect(component.suggestions().map((s) => s.label)).toEqual(['Polanco', 'Condesa']);
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
    component.search.subscribe((value) => searches.push(value));
    component.submitted.subscribe((value) => submits.push(value));

    component.query.set('  centro  ');
    component.onSubmit(new Event('submit'));

    expect(searches).toContain('centro');
    expect(submits).toEqual(['centro']);
  });
});
