import { TestBed } from '@angular/core/testing';
import { VisuallyHiddenComponent } from './visually-hidden';

describe(VisuallyHiddenComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VisuallyHiddenComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(VisuallyHiddenComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('applies the focusable modifier when requested', () => {
    const fixture = TestBed.createComponent(VisuallyHiddenComponent);
    fixture.componentRef.setInput('focusable', true);
    fixture.detectChanges();

    expect(fixture.nativeElement.classList.contains('syn-visually-hidden--focusable')).toBe(true);
  });
});
