import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SeparatorElementComponent } from './separator';

describe('SeparatorElementComponent', () => {
  let fixture: ComponentFixture<SeparatorElementComponent>;
  let component: SeparatorElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SeparatorElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(SeparatorElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should default to a semantic horizontal rule with no label (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.orientation()).toBe('horizontal');
    expect(component.hasLabel()).toBe(false);
    expect(component.label()).toBe('');
    expect(component.role()).toBe('separator');
    expect(component.ariaOrientation()).toBe('horizontal');

    const rule = fixture.nativeElement.querySelector('.separator');
    expect(rule.getAttribute('role')).toBe('separator');
    expect(rule.getAttribute('aria-orientation')).toBe('horizontal');
  });

  it('should render a centered label and stay semantic from config (render/config case)', async () => {
    fixture.componentRef.setInput('config', '{"label":"o","labelAlign":"center","decorative":true}');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.hasLabel()).toBe(true);
    expect(component.label()).toBe('o');
    expect(component.labelAlign()).toBe('center');
    // A labelled rule is always semantic even when decorative was requested.
    expect(component.decorative()).toBe(false);
    expect(component.role()).toBe('separator');

    const labelled = fixture.nativeElement.querySelector('.separator--labelled');
    expect(labelled).toBeTruthy();
    expect(labelled.querySelectorAll('.separator__line').length).toBe(2);
    expect(labelled.querySelector('.separator__label').textContent).toContain('o');
  });

  it('should switch to a decorative vertical rule via attributes (interaction case)', async () => {
    fixture.componentRef.setInput('orientation', 'vertical');
    fixture.componentRef.setInput('decorative', 'true');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.orientation()).toBe('vertical');
    // Label is ignored on vertical rules.
    fixture.componentRef.setInput('label', 'no-aplica');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.hasLabel()).toBe(false);

    expect(component.decorative()).toBe(true);
    expect(component.role()).toBe('none');
    expect(component.ariaOrientation()).toBeNull();

    const rule = fixture.nativeElement.querySelector('.separator--vertical');
    expect(rule).toBeTruthy();
    expect(rule.getAttribute('role')).toBe('none');
    expect(rule.hasAttribute('aria-orientation')).toBe(false);
  });

  it('should let direct inputs override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', '{"orientation":"vertical","labelAlign":"start"}');
    fixture.componentRef.setInput('orientation', 'horizontal');
    fixture.componentRef.setInput('labelAlign', 'end');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.orientation()).toBe('horizontal');
    expect(component.labelAlign()).toBe('end');

    // Re-applying the same inputs is idempotent.
    fixture.componentRef.setInput('orientation', 'horizontal');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.orientation()).toBe('horizontal');
    expect(component.labelAlign()).toBe('end');
  });
});
