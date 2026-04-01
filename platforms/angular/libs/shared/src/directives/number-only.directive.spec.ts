import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NumberOnlyDirective } from './number-only.directive';

@Component({
  standalone: true,
  imports: [NumberOnlyDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<input synNumberOnly />`,
})
class NumberOnlyHostComponent {}

describe(NumberOnlyDirective.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NumberOnlyHostComponent],
    }).compileComponents();
  });

  it('prevents non-numeric keys', () => {
    const fixture = TestBed.createComponent(NumberOnlyHostComponent);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const event = new KeyboardEvent('keydown', { key: 'a', cancelable: true });
    const prevented = !input.dispatchEvent(event);

    expect(prevented).toBe(true);
  });
});
