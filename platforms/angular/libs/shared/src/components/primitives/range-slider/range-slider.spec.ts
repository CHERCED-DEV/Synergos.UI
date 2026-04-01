import { TestBed } from '@angular/core/testing';
import { RangeSliderComponent } from './range-slider';

describe(RangeSliderComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RangeSliderComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(RangeSliderComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('emits value changes when the slider moves', () => {
    const fixture = TestBed.createComponent(RangeSliderComponent);
    const emitted: number[] = [];
    fixture.componentInstance.valueChange.subscribe((value) => {
      emitted.push(value);
    });
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('.syn-range-slider__input') as HTMLInputElement;
    input.value = '35';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(emitted).toEqual([35]);
  });

  it('shows the current value when enabled', () => {
    const fixture = TestBed.createComponent(RangeSliderComponent);
    fixture.componentRef.setInput('value', 55);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('55');
  });
});
