import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SignaturePadElementComponent, type SignatureChangeDetail } from './signature-pad';

/** Build a minimal PointerEvent-like object the component can consume. */
function pointer(id: number, clientX: number, clientY: number): PointerEvent {
  return {
    pointerId: id,
    clientX,
    clientY,
    offsetX: clientX,
    offsetY: clientY,
    preventDefault: () => undefined,
  } as unknown as PointerEvent;
}

describe('SignaturePadElementComponent', () => {
  let fixture: ComponentFixture<SignaturePadElementComponent>;
  let component: SignaturePadElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SignaturePadElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(SignaturePadElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create empty with default labels and no data url (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.empty()).toBe(true);
    expect(component.label()).toBe('Firma');
    expect(component.clearLabel()).toBe('Limpiar');
    expect(component.toDataUrl()).toBe('');
  });

  it('should resolve config + apply explicit input overrides (render+config case)', async () => {
    fixture.componentRef.setInput('config', '{"label":"Config firma","width":300,"penWidth":4}');
    fixture.componentRef.setInput('label', 'Firma del cliente');
    fixture.detectChanges();
    await fixture.whenStable();

    // Explicit attribute wins over config; config fills the rest.
    expect(component.label()).toBe('Firma del cliente');
    expect(component.width()).toBe(300);
    expect(component.penWidth()).toBe(4);
  });

  it('should capture strokes and emit a data url on pointer interaction (interaction case)', async () => {
    let detail: SignatureChangeDetail | undefined;
    component.signaturechange.subscribe((value) => (detail = value));
    fixture.detectChanges();
    await fixture.whenStable();

    component.onPointerDown(pointer(1, 10, 10));
    component.onPointerMove(pointer(1, 40, 35));
    component.onPointerUp(pointer(1, 40, 35));

    expect(component.empty()).toBe(false);
    expect(detail).toBeDefined();
    expect(detail?.empty).toBe(false);
    expect(detail?.dataUrl.startsWith('data:image/png')).toBe(true);

    const exported = component.export();
    expect(exported.startsWith('data:image/png')).toBe(true);
  });

  it('should be idempotent when clearing an already-empty pad (idempotent case)', async () => {
    let emissions = 0;
    component.signaturechange.subscribe(() => (emissions += 1));
    fixture.detectChanges();
    await fixture.whenStable();

    // Clearing an empty pad does nothing and emits nothing.
    component.clear();
    component.clear();
    expect(emissions).toBe(0);
    expect(component.empty()).toBe(true);

    // After drawing, the first clear empties + emits; a second clear is a no-op.
    component.onPointerDown(pointer(2, 5, 5));
    component.onPointerUp(pointer(2, 5, 5));
    const afterDraw = emissions;
    expect(afterDraw).toBeGreaterThan(0);

    component.clear();
    const afterFirstClear = emissions;
    expect(component.empty()).toBe(true);
    expect(afterFirstClear).toBe(afterDraw + 1);

    component.clear();
    expect(emissions).toBe(afterFirstClear);
  });
});
