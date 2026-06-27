import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  DrawerElementComponent,
  type DrawerOpenChangeDetail,
} from './drawer';

describe('DrawerElementComponent', () => {
  let fixture: ComponentFixture<DrawerElementComponent>;
  let component: DrawerElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DrawerElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(DrawerElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    // Ensure the scroll-lock effect cannot leak between tests.
    component.close();
    fixture.detectChanges();
    fixture.destroy();
  });

  it('should create closed with sane defaults and only the trigger rendered (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.isOpen()).toBe(false);
    expect(component.side()).toBe('end');
    expect(component.triggerLabel()).toBe('Abrir panel');
    expect(fixture.nativeElement.querySelector('.drawer__panel')).toBeNull();
    expect(fixture.nativeElement.querySelector('.drawer__trigger')).toBeTruthy();
  });

  it('should resolve config and render the panel as a modal dialog when open (render/config case)', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"triggerLabel":"Filtros","heading":"Refinar","drawerContent":"Cuerpo","side":"start","open":true}',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.isOpen()).toBe(true);
    expect(component.side()).toBe('start');
    expect(component.heading()).toBe('Refinar');
    expect(component.triggerLabel()).toBe('Filtros');

    const panel = fixture.nativeElement.querySelector('.drawer__panel');
    expect(panel).toBeTruthy();
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect(panel.getAttribute('aria-labelledby')).toBe(component.headingId);
    expect(panel.classList.contains('drawer__panel--start')).toBe(true);
  });

  it('should open/close/toggle and emit openchange + lock body scroll (interaction case)', async () => {
    const events: DrawerOpenChangeDetail[] = [];
    component.openchange.subscribe((detail) => events.push(detail));

    component.open();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.isOpen()).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');

    // Backdrop click dismisses.
    component.onBackdropClick();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.isOpen()).toBe(false);
    expect(document.body.style.overflow).not.toBe('hidden');

    component.toggle();
    fixture.detectChanges();
    expect(component.isOpen()).toBe(true);

    expect(events).toEqual([{ open: true }, { open: false }, { open: true }]);
  });

  it('should ignore redundant state changes (idempotent)', async () => {
    const events: DrawerOpenChangeDetail[] = [];
    component.openchange.subscribe((detail) => events.push(detail));

    component.close(); // already closed → no-op
    component.open();
    component.open(); // already open → no-op
    fixture.detectChanges();
    await fixture.whenStable();

    expect(events).toEqual([{ open: true }]);
    expect(component.isOpen()).toBe(true);
  });

  it('should fall back to a safe side for unknown values', async () => {
    fixture.componentRef.setInput('side', 'diagonal');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.side()).toBe('end');
  });
});
