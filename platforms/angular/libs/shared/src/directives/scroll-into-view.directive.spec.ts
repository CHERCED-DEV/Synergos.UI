import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ScrollIntoViewDirective } from './scroll-into-view.directive';

@Component({
  standalone: true,
  imports: [ScrollIntoViewDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div synScrollIntoView></div>`,
})
class ScrollIntoViewHostComponent {}

describe(ScrollIntoViewDirective.name, () => {
  it('scrolls when the element is outside the viewport', async () => {
    vi.useFakeTimers();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollSpy = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scrollSpy,
    });

    await TestBed.configureTestingModule({
      imports: [ScrollIntoViewHostComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(ScrollIntoViewHostComponent);
    const element = fixture.nativeElement.querySelector('div') as HTMLDivElement;
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      top: window.innerHeight + 40,
      bottom: window.innerHeight + 120,
    } as DOMRect);
    fixture.detectChanges();

    vi.runAllTimers();

    expect(scrollSpy).toHaveBeenCalledTimes(1);
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: originalScrollIntoView,
    });
    vi.useRealTimers();
  });
});
