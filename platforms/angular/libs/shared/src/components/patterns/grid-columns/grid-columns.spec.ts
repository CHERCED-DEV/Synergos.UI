import { TestBed } from '@angular/core/testing';
import { GridColumnsComponent } from './grid-columns';

describe(GridColumnsComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GridColumnsComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(GridColumnsComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('applies fixed-column layout classes', () => {
    const fixture = TestBed.createComponent(GridColumnsComponent);
    fixture.componentRef.setInput('autoFit', false);
    fixture.detectChanges();

    const grid = fixture.nativeElement.querySelector('.syn-grid-columns') as HTMLElement;
    expect(grid.className).toContain('syn-grid-columns--fixed');
  });

  it('sin stackBelow, las columnas fijas no se apilan en ningún ancho (option-group no cambia)', () => {
    const fixture = TestBed.createComponent(GridColumnsComponent);
    fixture.componentRef.setInput('autoFit', false);
    fixture.detectChanges();

    const grid = fixture.nativeElement.querySelector('.syn-grid-columns') as HTMLElement;
    expect(grid.className).not.toContain('syn-grid-columns--stack');
  });

  it('con stackBelow y columnas fijas, pide apilarse bajo ese punto de corte; con auto-fit no hace falta', () => {
    const fixture = TestBed.createComponent(GridColumnsComponent);
    fixture.componentRef.setInput('autoFit', false);
    fixture.componentRef.setInput('stackBelow', 'md');
    fixture.detectChanges();
    const grid = fixture.nativeElement.querySelector('.syn-grid-columns') as HTMLElement;
    expect(grid.className).toContain('syn-grid-columns--stack-md');

    fixture.componentRef.setInput('autoFit', true);
    fixture.detectChanges();
    expect(grid.className).not.toContain('syn-grid-columns--stack');
  });
});
