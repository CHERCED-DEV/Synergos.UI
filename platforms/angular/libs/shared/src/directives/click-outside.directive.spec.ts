import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ClickOutsideDirective } from './click-outside.directive';

@Component({
  standalone: true,
  imports: [ClickOutsideDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div synClickOutside (clickedOutside)="outsideCount = outsideCount + 1"><button>Inside</button></div>`,
})
class ClickOutsideHostComponent {
  outsideCount = 0;
}

describe(ClickOutsideDirective.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClickOutsideHostComponent],
    }).compileComponents();
  });

  it('emits when clicking outside the host element', () => {
    const fixture = TestBed.createComponent(ClickOutsideHostComponent);
    fixture.detectChanges();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(fixture.componentInstance.outsideCount).toBe(1);
  });
});
