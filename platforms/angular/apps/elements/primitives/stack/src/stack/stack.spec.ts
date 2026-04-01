import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { StackComponent } from './stack';

describe('StackComponent', () => {
  let fixture: ComponentFixture<StackComponent>;
  let component: StackComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StackComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(StackComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should apply direction modifier class', async () => {
    fixture.componentRef.setInput('direction', 'row');
    fixture.detectChanges();
    await fixture.whenStable();

    const div = fixture.nativeElement.querySelector('.stack');
    expect(div?.className).toContain('sg-stack--row');
  });

  it('should apply default direction column', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const div = fixture.nativeElement.querySelector('.stack');
    expect(div?.className).toContain('sg-stack--column');
  });

  it('should apply gap modifier class', async () => {
    fixture.componentRef.setInput('gap', 'lg');
    fixture.detectChanges();
    await fixture.whenStable();

    const div = fixture.nativeElement.querySelector('.stack');
    expect(div?.className).toContain('sg-stack--gap-lg');
  });

  it('should apply alignment modifier class', async () => {
    fixture.componentRef.setInput('alignment', 'center');
    fixture.detectChanges();
    await fixture.whenStable();

    const div = fixture.nativeElement.querySelector('.stack');
    expect(div?.className).toContain('sg-stack--align-center');
  });

  it('should apply justify modifier class', async () => {
    fixture.componentRef.setInput('justify', 'between');
    fixture.detectChanges();
    await fixture.whenStable();

    const div = fixture.nativeElement.querySelector('.stack');
    expect(div?.className).toContain('sg-stack--justify-between');
  });

  it('should apply wrap class when wrap is true', async () => {
    fixture.componentRef.setInput('wrap', true);
    fixture.detectChanges();
    await fixture.whenStable();

    const div = fixture.nativeElement.querySelector('.stack');
    expect(div?.className).toContain('sg-stack--wrap');
  });

  it('should not apply wrap class when wrap is false', async () => {
    fixture.componentRef.setInput('wrap', false);
    fixture.detectChanges();
    await fixture.whenStable();

    const div = fixture.nativeElement.querySelector('.stack');
    expect(div?.className).not.toContain('sg-stack--wrap');
  });

  it('should apply theme modifier class', async () => {
    fixture.componentRef.setInput('theme', 'dark');
    fixture.detectChanges();
    await fixture.whenStable();

    const div = fixture.nativeElement.querySelector('.stack');
    expect(div?.className).toContain('sg-stack--dark');
  });

  it('should parse config attribute and apply values', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"direction":"row","gap":"xl","alignment":"center","justify":"between","wrap":true,"theme":"dark"}',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.direction()).toBe('row');
    expect(component.gap()).toBe('xl');
    expect(component.alignment()).toBe('center');
    expect(component.justify()).toBe('between');
    expect(component.wrap()).toBe(true);
    expect(component.theme()).toBe('dark');
  });
});
