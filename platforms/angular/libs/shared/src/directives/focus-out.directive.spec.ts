import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FocusOutDirective } from './focus-out.directive';

@Component({
  standalone: true,
  imports: [FocusOutDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div synFocusOut (focusOutside)="outsideCount = outsideCount + 1">
      <button id="inside">Inside</button>
    </div>
    <button id="outside">Outside</button>
  `,
})
class FocusOutHostComponent {
  outsideCount = 0;
}

describe(FocusOutDirective.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FocusOutHostComponent],
    }).compileComponents();
  });

  it('emits when focus leaves the host element', async () => {
    const fixture = TestBed.createComponent(FocusOutHostComponent);
    fixture.detectChanges();

    const inside = fixture.nativeElement.querySelector('#inside') as HTMLButtonElement;
    const outside = fixture.nativeElement.querySelector('#outside') as HTMLButtonElement;

    inside.focus();
    outside.focus();
    await Promise.resolve();

    expect(fixture.componentInstance.outsideCount).toBe(1);
  });
});
