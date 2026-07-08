import { TestBed } from '@angular/core/testing';
import { TabsComponent } from './tabs';

describe(TabsComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TabsComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(TabsComponent);
    fixture.componentRef.setInput('tabs', [
      { id: 'a', label: 'A', content: 'Content A' },
      { id: 'b', label: 'B', content: 'Content B' },
    ]);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('changes active tab when clicked', () => {
    const fixture = TestBed.createComponent(TabsComponent);
    fixture.componentRef.setInput('tabs', [
      { id: 'a', label: 'A', content: 'Content A' },
      { id: 'b', label: 'B', content: 'Content B' },
    ]);

    const changed = vi.fn();
    fixture.componentInstance.activeIdChange.subscribe(changed);
    fixture.detectChanges();

    const secondTab = fixture.nativeElement.querySelectorAll('[role="tab"]')[1] as HTMLButtonElement;
    secondTab.click();
    fixture.detectChanges();

    expect(changed).toHaveBeenCalledWith('b');
    const panel = fixture.nativeElement.querySelector('[role="tabpanel"]') as HTMLElement;
    expect(panel.textContent?.trim()).toContain('Content B');
  });

  it('roving tabindex: ArrowRight moves focus to the destination tab button', () => {
    // jsdom does not implement scrollIntoView — stub it so the roving focus path runs.
    Element.prototype.scrollIntoView = vi.fn();

    const fixture = TestBed.createComponent(TabsComponent);
    fixture.componentRef.setInput('tabs', [
      { id: 'a', label: 'A', content: 'Content A' },
      { id: 'b', label: 'B', content: 'Content B' },
      { id: 'c', label: 'C', content: 'Content C' },
    ]);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('[role="tab"]');
    const first = buttons[0] as HTMLButtonElement;
    const second = buttons[1] as HTMLButtonElement;

    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();

    // Focus must follow the roving tabindex, not stay trapped on the previous tab.
    expect(document.activeElement).toBe(second);
    expect(second.getAttribute('aria-selected')).toBe('true');
    expect(first.getAttribute('aria-selected')).toBe('false');

    fixture.destroy();
    fixture.nativeElement.remove();
  });

  it('skips disabled tabs when navigating with the keyboard', () => {
    Element.prototype.scrollIntoView = vi.fn();

    const fixture = TestBed.createComponent(TabsComponent);
    fixture.componentRef.setInput('tabs', [
      { id: 'a', label: 'A', content: 'Content A' },
      { id: 'b', label: 'B', content: 'Content B', disabled: true },
      { id: 'c', label: 'C', content: 'Content C' },
    ]);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('[role="tab"]');
    const first = buttons[0] as HTMLButtonElement;
    const third = buttons[2] as HTMLButtonElement;

    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();

    // 'b' is disabled → focus and activation jump straight to 'c'.
    expect(document.activeElement).toBe(third);
    expect(third.getAttribute('aria-selected')).toBe('true');

    fixture.destroy();
    fixture.nativeElement.remove();
  });

  it('exposes aria-orientation on the tablist and switches arrow keys when vertical', () => {
    Element.prototype.scrollIntoView = vi.fn();

    const fixture = TestBed.createComponent(TabsComponent);
    fixture.componentRef.setInput('tabs', [
      { id: 'a', label: 'A', content: 'Content A' },
      { id: 'b', label: 'B', content: 'Content B' },
    ]);
    fixture.componentRef.setInput('orientation', 'vertical');
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();

    const tablist = fixture.nativeElement.querySelector('[role="tablist"]') as HTMLElement;
    expect(tablist.getAttribute('aria-orientation')).toBe('vertical');

    const buttons = fixture.nativeElement.querySelectorAll('[role="tab"]');
    const first = buttons[0] as HTMLButtonElement;
    const second = buttons[1] as HTMLButtonElement;

    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();

    expect(document.activeElement).toBe(second);
    expect(second.getAttribute('aria-selected')).toBe('true');

    fixture.destroy();
    fixture.nativeElement.remove();
  });
});
