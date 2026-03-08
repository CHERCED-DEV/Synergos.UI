import { TestBed } from '@angular/core/testing';
import { InputComponent } from './input';

describe(InputComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InputComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(InputComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('emits value changes', () => {
    const fixture = TestBed.createComponent(InputComponent);
    const changed = vi.fn();
    fixture.componentInstance.valueChange.subscribe(changed);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'Synergos';
    input.dispatchEvent(new Event('input'));

    expect(changed).toHaveBeenCalledWith('Synergos');
  });
});