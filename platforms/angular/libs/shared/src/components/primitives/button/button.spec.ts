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

  it('resolves base values from config and lets direct inputs override them', () => {
    const fixture = TestBed.createComponent(ButtonComponent);

    fixture.componentRef.setInput('config', {
      label: 'Save changes',
      variant: 'outline',
      disabled: true,
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.label()).toBe('Save changes');
    expect(fixture.componentInstance.variant()).toBe('outline');
    expect(fixture.componentInstance.disabled()).toBe(true);

    fixture.componentRef.setInput('label', 'Save now');
    fixture.componentRef.setInput('disabled', false);
    fixture.detectChanges();

    expect(fixture.componentInstance.label()).toBe('Save now');
    expect(fixture.componentInstance.disabled()).toBe(false);
  });
});
