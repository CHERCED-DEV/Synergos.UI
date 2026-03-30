import { TestBed } from '@angular/core/testing';
import { RadioComponent } from './radio';

describe(RadioComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RadioComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(RadioComponent);
    fixture.componentRef.setInput('value', 'active');
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('emits selected when checked', () => {
    const fixture = TestBed.createComponent(RadioComponent);
    fixture.componentRef.setInput('value', 'active');

    const selected = vi.fn();
    fixture.componentInstance.selected.subscribe(selected);
    fixture.detectChanges();

    const radio = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));

    expect(selected).toHaveBeenCalledWith('active');
  });
});