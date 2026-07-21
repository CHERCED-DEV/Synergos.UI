import { TestBed } from '@angular/core/testing';
import { IconButtonComponent } from './icon-button';

describe(IconButtonComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IconButtonComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(IconButtonComponent);
    fixture.componentRef.setInput('icon', 'x');
    fixture.componentRef.setInput('ariaLabel', 'Close dialog');
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('emits pressed on click', () => {
    const fixture = TestBed.createComponent(IconButtonComponent);
    fixture.componentRef.setInput('icon', 'x');
    fixture.componentRef.setInput('ariaLabel', 'Close dialog');

    const pressed = vi.fn();
    fixture.componentInstance.pressed.subscribe(pressed);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    button.click();

    expect(pressed).toHaveBeenCalledTimes(1);
  });
});