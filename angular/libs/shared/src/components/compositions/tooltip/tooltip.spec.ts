import { TestBed } from '@angular/core/testing';
import { TooltipComponent } from './tooltip';

describe(TooltipComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TooltipComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(TooltipComponent);
    fixture.componentRef.setInput('text', 'Info');
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('shows tooltip content on hover', () => {
    const fixture = TestBed.createComponent(TooltipComponent);
    fixture.componentRef.setInput('text', 'Accessible help');
    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('.syn-tooltip') as HTMLElement;
    host.dispatchEvent(new Event('mouseenter'));
    fixture.detectChanges();

    const bubble = fixture.nativeElement.querySelector('[role="tooltip"]') as HTMLElement;
    expect(bubble.textContent?.trim()).toBe('Accessible help');
  });
});