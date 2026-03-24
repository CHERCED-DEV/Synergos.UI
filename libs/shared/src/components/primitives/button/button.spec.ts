import { TestBed } from '@angular/core/testing';
import { ButtonComponent } from './button';

describe(ButtonComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ButtonComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(ButtonComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('emits pressed when clicked', () => {
    const fixture = TestBed.createComponent(ButtonComponent);
    const pressed = vi.fn();
    fixture.componentInstance.pressed.subscribe(pressed);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    button.click();

    expect(pressed).toHaveBeenCalledTimes(1);
  });
});