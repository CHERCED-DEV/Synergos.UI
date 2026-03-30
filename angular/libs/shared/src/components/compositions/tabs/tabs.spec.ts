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
});