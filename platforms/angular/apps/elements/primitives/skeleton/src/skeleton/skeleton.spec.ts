import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SkeletonElementComponent } from './skeleton';

describe('SkeletonElementComponent', () => {
  let fixture: ComponentFixture<SkeletonElementComponent>;
  let component: SkeletonElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkeletonElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(SkeletonElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should fall back to default text shape with 3 ragged lines (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.shape()).toBe('text');
    expect(component.isText()).toBe(true);
    expect(component.lines().length).toBe(3);
    // Last line is shortened for a natural ragged edge.
    expect(component.lines()[2].short).toBe(true);
    expect(component.blocks()).toEqual([]);
    expect(component.animated()).toBe(true);
    expect(component.label()).toBe('Cargando contenido');
  });

  it('should render N blocks for a non-text shape from config (render+config case)', async () => {
    fixture.componentRef.setInput('shape', 'avatar');
    fixture.componentRef.setInput('count', '4');
    fixture.componentRef.setInput('label', 'Cargando perfiles');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.shape()).toBe('avatar');
    expect(component.isText()).toBe(false);
    expect(component.isCircle()).toBe(true);
    expect(component.blocks().length).toBe(4);
    expect(component.lines().length).toBe(4);
    expect(component.label()).toBe('Cargando perfiles');

    const bars = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.skeleton__bar--circle',
    );
    expect(bars.length).toBe(4);
  });

  it('should normalize bad shapes and clamp the count (interaction/validation case)', async () => {
    fixture.componentRef.setInput('shape', 'NOT_A_SHAPE');
    fixture.componentRef.setInput('count', '999');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.shape()).toBe('text');
    expect(component.count()).toBe(24);

    fixture.componentRef.setInput('count', '0');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.count()).toBe(1);

    fixture.componentRef.setInput('animated', 'false');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.animated()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).classList).toContain('sg-skeleton--static');
  });

  it('should let direct inputs override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', '{"shape":"card","count":2,"label":"Config label"}');
    fixture.detectChanges();
    await fixture.whenStable();
    // Config alone is honored.
    expect(component.shape()).toBe('card');
    expect(component.count()).toBe(2);
    expect(component.label()).toBe('Config label');

    // Explicit attributes win over config; re-applying is idempotent.
    fixture.componentRef.setInput('shape', 'rect');
    fixture.componentRef.setInput('count', '5');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.shape()).toBe('rect');
    expect(component.count()).toBe(5);

    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.shape()).toBe('rect');
    expect(component.count()).toBe(5);
  });
});
