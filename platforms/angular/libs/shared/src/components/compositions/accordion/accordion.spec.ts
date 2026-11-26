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

/** Tres a la vez, como las preguntas de un FAQ: cada botón tiene que apuntar a SU panel. */
@Component({
  standalone: true,
  imports: [AccordionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <syn-accordion title="Uno" [initiallyExpanded]="true"><p>a</p></syn-accordion>
    <syn-accordion title="Dos" [initiallyExpanded]="true"><p>b</p></syn-accordion>
    <syn-accordion title="Tres" [initiallyExpanded]="true"><p>c</p></syn-accordion>
  `,
})
class TresAcordeonesComponent {}

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

  it('cada botón controla su propio panel, con ids que no se repiten (el FAQ de Salud)', async () => {
    const fixture = TestBed.createComponent(TresAcordeonesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    const botones = Array.from(host.querySelectorAll<HTMLButtonElement>('.syn-accordion__trigger'));
    const controlados = botones.map((boton) => boton.getAttribute('aria-controls'));
    expect(new Set(controlados).size).toBe(3);
    botones.forEach((boton, i) => {
      const panel = host.querySelector(`#${controlados[i]}`);
      expect(panel?.textContent).toBe(['a', 'b', 'c'][i]);
      expect(panel?.getAttribute('aria-labelledby')).toBe(boton.id);
    });
  });
});
