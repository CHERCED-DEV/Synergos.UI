import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TAG_SYNHOST } from '@synergos/contracts';
import { TagElementComponent } from './tag';

describe('TagElementComponent', () => {
  let fixture: ComponentFixture<TagElementComponent>;
  let component: TagElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TagElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(TagElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render nothing without label or icon (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.label()).toBe('');
    expect(component.color()).toBe('neutral');
    expect(component.isRenderable()).toBe(false);
    expect(component.isVisible()).toBe(false);
    expect(fixture.nativeElement.querySelector('.tag')).toBeNull();
  });

  // Lo que el editor autora (label, color) llega por `config`; el ícono y el quitar no los
  // autora nadie en el CMS, así que son atributos del elemento (ADR 0135).
  it('should render label and tone from config, and icon from its attribute (render + config case)', async () => {
    fixture.componentRef.setInput('config', '{"label":"Frontend","color":"success"}');
    fixture.componentRef.setInput('icon', '★');
    fixture.componentRef.setInput('removable', true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.label()).toBe('Frontend');
    expect(component.color()).toBe('success');
    expect(component.hasIcon()).toBe(true);
    expect(component.removable()).toBe(true);

    const chip = fixture.nativeElement.querySelector('.tag') as HTMLElement;
    expect(chip).not.toBeNull();
    expect(chip.classList.contains('tag--success')).toBe(true);
    expect(chip.querySelector('.tag__label')?.textContent?.trim()).toBe('Frontend');
    expect(chip.querySelector('.tag__remove')).not.toBeNull();
  });

  it('should emit and collapse when removed (interaction case)', async () => {
    fixture.componentRef.setInput('label', 'Angular');
    fixture.componentRef.setInput('removable', true);
    fixture.detectChanges();
    await fixture.whenStable();

    let emitted: string | undefined;
    component.removed.subscribe((value) => (emitted = value));

    const button = fixture.nativeElement.querySelector('.tag__remove') as HTMLButtonElement;
    button.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(emitted).toBe('Angular');
    expect(component.isVisible()).toBe(false);
    expect(fixture.nativeElement.querySelector('.tag')).toBeNull();
  });

  // D1: con `tagLabel`/`tagColor` —lo que mandaba la vista— el chip desaparecía al hidratar.
  // Éste alimenta el `config` EXACTO que emite hoy la vista del CMS (el `ejemplo` del contrato).
  it('pinta lo que el editor escribió con el config exacto que emite la vista del CMS', async () => {
    const { ejemplo } = TAG_SYNHOST;
    fixture.componentRef.setInput('config', JSON.stringify(ejemplo));
    fixture.detectChanges();
    await fixture.whenStable();

    const chip = fixture.nativeElement.querySelector('.tag') as HTMLElement | null;
    expect(chip).not.toBeNull();
    expect(chip?.querySelector('.tag__label')?.textContent?.trim()).toBe(ejemplo.label);
    expect(chip?.classList.contains(`tag--${ejemplo.color}`)).toBe(true);
  });

  it('should let direct inputs override config and reset idempotently (idempotent case)', async () => {
    fixture.componentRef.setInput('config', '{"label":"Config","color":"brand"}');
    fixture.componentRef.setInput('removable', true);
    fixture.componentRef.setInput('label', 'Input');
    fixture.componentRef.setInput('color', 'danger');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.label()).toBe('Input');
    expect(component.color()).toBe('danger');

    // Removing then resetting returns to the original visible render.
    component.remove();
    fixture.detectChanges();
    expect(component.isVisible()).toBe(false);

    component.reset();
    component.reset();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.isVisible()).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('.tag').length).toBe(1);
  });
});
