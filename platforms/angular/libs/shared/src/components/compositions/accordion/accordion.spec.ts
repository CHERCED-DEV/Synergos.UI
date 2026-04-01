import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AccordionComponent } from './accordion';

@Component({
  standalone: true,
  imports: [AccordionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <syn-accordion title="Details" [initiallyExpanded]="expanded">
      <p>Accordion body</p>
    </syn-accordion>
  `,
})
class AccordionHostComponent {
  expanded = false;
}

describe(AccordionComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccordionHostComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(AccordionHostComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('syn-accordion')).toBeTruthy();
  });

  it('toggles the panel content when activated', () => {
    const fixture = TestBed.createComponent(AccordionHostComponent);
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('.syn-accordion__trigger') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Accordion body');
  });

  it('starts expanded when requested', async () => {
    const fixture = TestBed.createComponent(AccordionHostComponent);
    fixture.componentInstance.expanded = true;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Accordion body');
  });
});
