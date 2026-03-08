import { TestBed } from '@angular/core/testing';
import { AlertComponent } from './alert';

describe(AlertComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AlertComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(AlertComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('dismisses the alert and emits dismissed', () => {
    const fixture = TestBed.createComponent(AlertComponent);
    const dismissed = vi.fn();
    fixture.componentInstance.dismissed.subscribe(dismissed);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.syn-alert__dismiss') as HTMLButtonElement;
    button.click();
    fixture.detectChanges();

    expect(dismissed).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
  });
});