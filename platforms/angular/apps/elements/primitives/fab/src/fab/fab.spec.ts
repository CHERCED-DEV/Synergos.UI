import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FabActivateDetail, FabElementComponent } from './fab';

describe('FabElementComponent', () => {
  let fixture: ComponentFixture<FabElementComponent>;
  let component: FabElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FabElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(FabElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with safe defaults and no tooltip (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.iconKey()).toBe('plus');
    expect(component.position()).toBe('bottom-right');
    expect(component.hasTooltip()).toBe(false);
    expect(component.isLink()).toBe(false);
    expect(component.iconPath().length).toBeGreaterThan(0);
  });

  it('should resolve icon, position, link and tooltip from config (render+config case)', async () => {
    fixture.componentRef.setInput('iconKey', 'message');
    fixture.componentRef.setInput('position', 'top-left');
    fixture.componentRef.setInput('actionLink', 'https://wa.me/57300');
    fixture.componentRef.setInput('tooltip', 'Escríbenos');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.iconKey()).toBe('message');
    expect(component.position()).toBe('top-left');
    expect(component.isLink()).toBe(true);
    expect(component.target()).toBe('_blank');
    expect(component.rel()).toBe('noopener noreferrer');
    expect(component.hasTooltip()).toBe(true);
    expect(component.label()).toBe('Escríbenos');

    const anchor = (fixture.nativeElement as HTMLElement).querySelector('a.fab__trigger');
    expect(anchor).toBeTruthy();
    expect(anchor?.getAttribute('href')).toBe('https://wa.me/57300');
  });

  it('should emit fabactivate and toggle tooltip on interaction (interaction case)', async () => {
    fixture.componentRef.setInput('tooltip', 'Nueva acción');
    fixture.detectChanges();
    await fixture.whenStable();

    let detail: FabActivateDetail | undefined;
    component.fabactivate.subscribe((d) => (detail = d));

    component.openTooltip();
    expect(component.tooltipOpen()).toBe(true);

    component.activate();
    expect(detail).toEqual({ actionLink: '' });

    component.closeTooltip();
    expect(component.tooltipOpen()).toBe(false);
  });

  it('should let direct inputs override config and reject invalid position (idempotent precedence)', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"iconKey":"chat","position":"weird-corner","label":"Config label"}',
    );
    fixture.componentRef.setInput('label', 'Input label');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.iconKey()).toBe('chat');
    expect(component.position()).toBe('bottom-right');
    expect(component.label()).toBe('Input label');

    // Re-applying the same inputs yields the same resolved state (idempotent).
    fixture.componentRef.setInput('label', 'Input label');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.label()).toBe('Input label');
  });
});
