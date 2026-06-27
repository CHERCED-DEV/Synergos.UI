import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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

  it('should render label, tone and icon from config (render + config case)', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"label":"Frontend","color":"success","icon":"★","removable":true}',
    );
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

  it('should let direct inputs override config and reset idempotently (idempotent case)', async () => {
    fixture.componentRef.setInput('config', '{"label":"Config","color":"brand","removable":true}');
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
