import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LettersOnlyDirective } from './letters-only.directive';

@Component({
  standalone: true,
  imports: [LettersOnlyDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<input synLettersOnly />`,
})
class LettersOnlyHostComponent {}

describe(LettersOnlyDirective.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LettersOnlyHostComponent],
    }).compileComponents();
  });

  it('prevents non-letter keys', () => {
    const fixture = TestBed.createComponent(LettersOnlyHostComponent);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const event = new KeyboardEvent('keydown', { key: '1', cancelable: true });
    const prevented = !input.dispatchEvent(event);

    expect(prevented).toBe(true);
  });
});
