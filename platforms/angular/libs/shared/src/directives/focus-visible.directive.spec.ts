import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FocusVisibleDirective } from './focus-visible.directive';

@Component({
  standalone: true,
  imports: [FocusVisibleDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button type="button" synFocusVisible>Focus me</button>`,
})
class FocusVisibleHostComponent {}

describe(FocusVisibleDirective.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FocusVisibleHostComponent],
    }).compileComponents();
  });

  it('adds a focus-visible class after keyboard focus', () => {
    const fixture = TestBed.createComponent(FocusVisibleHostComponent);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    button.focus();
    fixture.detectChanges();

    expect(button.classList.contains('syn-focus-visible')).toBe(true);
  });

  it('removes the focus-visible class on blur', () => {
    const fixture = TestBed.createComponent(FocusVisibleHostComponent);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    button.focus();
    button.blur();
    fixture.detectChanges();

    expect(button.classList.contains('syn-focus-visible')).toBe(false);
  });
});
