import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalTriggerElementComponent, type ModalToggleDetail } from './modal-trigger';

describe('ModalTriggerElementComponent', () => {
  let fixture: ComponentFixture<ModalTriggerElementComponent>;
  let component: ModalTriggerElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModalTriggerElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(ModalTriggerElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create closed with default trigger label and no dialog (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.isOpen()).toBe(false);
    expect(component.triggerLabel()).toBe('Abrir');
    expect(component.modalSize()).toBe('md');

    const dialog = fixture.nativeElement.querySelector('[data-modal-dialog]');
    expect(dialog).toBeNull();
    const trigger = fixture.nativeElement.querySelector('.modal-trigger__button');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('should resolve config and render an accessible dialog when opened (render/config case)', async () => {
    fixture.componentRef.setInput('triggerLabel', 'Ver detalles');
    fixture.componentRef.setInput('modalTitle', 'Términos del servicio');
    fixture.componentRef.setInput('modalContent', 'Contenido del modal.');
    fixture.componentRef.setInput('modalSize', 'lg');
    fixture.detectChanges();

    expect(component.triggerLabel()).toBe('Ver detalles');
    expect(component.hasTitle()).toBe(true);
    expect(component.hasContent()).toBe(true);
    expect(component.modalSize()).toBe('lg');

    component.open();
    fixture.detectChanges();
    await fixture.whenStable();

    const dialog: HTMLElement | null = fixture.nativeElement.querySelector('[data-modal-dialog]');
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute('role')).toBe('dialog');
    expect(dialog!.getAttribute('aria-modal')).toBe('true');
    expect(dialog!.getAttribute('aria-labelledby')).toBe(component.titleId);
    expect(dialog!.getAttribute('aria-describedby')).toBe(component.contentId);
  });

  it('should open, close, and emit modaltoggle on each transition (interaction case)', async () => {
    const events: ModalToggleDetail[] = [];
    component.modaltoggle.subscribe((detail) => events.push(detail));

    component.open();
    fixture.detectChanges();
    expect(component.isOpen()).toBe(true);

    // Escape (dismissible by default) closes the dialog.
    component.onDialogKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(component.isOpen()).toBe(false);

    expect(events.map((event) => event.open)).toEqual([true, false]);
  });

  it('should keep direct inputs winning over config and ignore redundant opens (idempotent precedence)', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"modalSize":"sm","triggerLabel":"Config label","dismissible":false}',
    );
    fixture.componentRef.setInput('modalSize', 'full');
    fixture.detectChanges();

    // Direct input wins over config; config still fills unset fields.
    expect(component.modalSize()).toBe('full');
    expect(component.triggerLabel()).toBe('Config label');
    expect(component.dismissible()).toBe(false);

    const events: ModalToggleDetail[] = [];
    component.modaltoggle.subscribe((detail) => events.push(detail));

    component.open();
    component.open(); // second open is a no-op while already open
    fixture.detectChanges();
    expect(events.length).toBe(1);
    expect(component.isOpen()).toBe(true);

    // Non-dismissible: Escape and backdrop do not close.
    component.onDialogKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(component.isOpen()).toBe(true);
    expect(events.length).toBe(1);
  });
});
