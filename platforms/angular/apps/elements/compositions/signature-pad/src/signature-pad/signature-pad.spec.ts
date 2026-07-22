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
    // ENVIRONMENT NOTE — this test used to assert `dataUrl.startsWith('data:image/png')`
    // against the real canvas. jsdom ships no 2D rasterizer unless the optional `canvas`
    // npm package is installed (it is not, on purpose — it is a native build): `getContext('2d')`
    // returns null and `toDataURL()` returns null, so no PNG *bytes* can exist here. Producing
    // real pixels is the encoder's job, which is a browser concern, not the component's.
    //
    // Only the pixels are out of reach, though — NOT the component's contract. The encoder is
    // stubbed here to assert the browser-shaped path (stroke registered, `signaturechange`
    // emitted, PNG requested, result passed through untouched). The opposite path — no encoder
    // available — is asserted UNSTUBBED in the test below, because the component owns that too.
    const canvas = component.canvasRef()?.nativeElement;
    expect(canvas).toBeDefined();

    const requestedTypes: (string | undefined)[] = [];
    const stubbedPng = 'data:image/png;base64,c3R1Yg==';
    (canvas as HTMLCanvasElement).toDataURL = ((type?: string) => {
      requestedTypes.push(type);
      return stubbedPng;
    }) as HTMLCanvasElement['toDataURL'];

    let detail: SignatureChangeDetail | undefined;
    component.signaturechange.subscribe((value) => (detail = value));
    fixture.detectChanges();
    await fixture.whenStable();

    component.onPointerDown(pointer(1, 10, 10));
    component.onPointerMove(pointer(1, 40, 35));
    component.onPointerUp(pointer(1, 40, 35));

    // The stroke was captured and announced.
    expect(component.empty()).toBe(false);
    expect(detail).toBeDefined();
    expect(detail?.empty).toBe(false);
    expect(detail?.dataUrl).toBe(stubbedPng);

    // export() re-reads the canvas and returns exactly what it produced.
    const exported = component.export();
    expect(exported).toBe(stubbedPng);

    // Both reads asked the canvas for PNG specifically — the format is the component's call.
    expect(requestedTypes).toEqual(['image/png', 'image/png']);
  });

  it('should degrade to an empty string when the canvas cannot encode (no-encoder case)', async () => {
    // Deliberately UNSTUBBED: jsdom's `toDataURL` is a real function that returns null.
    // That is exactly the shape the component must absorb — a present encoder that yields
    // nothing — and it is reachable outside jsdom too (hardened/embedded WebViews, and the
    // degenerate 'data:,' a canvas returns when it cannot be encoded). `dataUrl` is declared
    // `string`, so degrading by ABSENCE ('') is the contract; leaking null is not.
    let detail: SignatureChangeDetail | undefined;
    component.signaturechange.subscribe((value) => (detail = value));
    fixture.detectChanges();
    await fixture.whenStable();

    component.onPointerDown(pointer(7, 12, 12));
    component.onPointerMove(pointer(7, 30, 30));
    component.onPointerUp(pointer(7, 30, 30));

    // The stroke still registers — losing the encoder must not lose the state.
    expect(component.empty()).toBe(false);
    expect(detail?.empty).toBe(false);

    // ...and the export honors its declared type instead of emitting null.
    expect(component.toDataUrl()).toBe('');
    expect(typeof detail?.dataUrl).toBe('string');
    expect(detail?.dataUrl).toBe('');
    expect(component.export()).toBe('');
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
