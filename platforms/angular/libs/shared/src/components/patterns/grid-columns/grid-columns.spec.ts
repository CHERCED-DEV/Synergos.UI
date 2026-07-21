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
});
