import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { CtaGroupComponent } from './cta-group';

describe('CtaGroupComponent', () => {
  let fixture: ComponentFixture<CtaGroupComponent>;
  let component: CtaGroupComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CtaGroupComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(CtaGroupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render primary CTA when label and url are provided', async () => {
    fixture.componentRef.setInput('primaryLabel', 'Get Started');
    fixture.componentRef.setInput('primaryUrl', '/start');
    fixture.detectChanges();
    await fixture.whenStable();

    const link = fixture.nativeElement.querySelector('.cta-group__link');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('/start');
  });

  it('should not render primary CTA when label is missing', async () => {
    fixture.componentRef.setInput('primaryUrl', '/start');
    fixture.detectChanges();
    await fixture.whenStable();

    const link = fixture.nativeElement.querySelector('.cta-group__link');
    expect(link).toBeNull();
  });

  it('should not render primary CTA when url is missing', async () => {
    fixture.componentRef.setInput('primaryLabel', 'Get Started');
    fixture.detectChanges();
    await fixture.whenStable();

    const link = fixture.nativeElement.querySelector('.cta-group__link');
    expect(link).toBeNull();
  });

  it('should render secondary CTA when label and url are provided', async () => {
    fixture.componentRef.setInput('secondaryLabel', 'Learn More');
    fixture.componentRef.setInput('secondaryUrl', '/about');
    fixture.detectChanges();
    await fixture.whenStable();

    const link = fixture.nativeElement.querySelector('.cta-group__link--secondary');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('/about');
  });

  it('should open primary CTA in new tab when primaryTarget is _blank', async () => {
    fixture.componentRef.setInput('primaryLabel', 'Go');
    fixture.componentRef.setInput('primaryUrl', '/link');
    fixture.componentRef.setInput('primaryTarget', '_blank');
    fixture.detectChanges();
    await fixture.whenStable();

    const link = fixture.nativeElement.querySelector('.cta-group__link');
    expect(link?.getAttribute('target')).toBe('_blank');
  });

  it('should open secondary CTA in new tab when secondaryTarget is _blank', async () => {
    fixture.componentRef.setInput('secondaryLabel', 'See more');
    fixture.componentRef.setInput('secondaryUrl', '/more');
    fixture.componentRef.setInput('secondaryTarget', '_blank');
    fixture.detectChanges();
    await fixture.whenStable();

    const link = fixture.nativeElement.querySelector('.cta-group__link--secondary');
    expect(link?.getAttribute('target')).toBe('_blank');
  });

  it('should apply alignment modifier class', async () => {
    fixture.componentRef.setInput('alignment', 'center');
    fixture.detectChanges();
    await fixture.whenStable();

    const host = fixture.nativeElement.querySelector('.cta-group');
    expect(host?.className).toContain('sg-cta-group--center');
  });

  it('should parse config attribute and apply values', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"primaryLabel":"Start","primaryUrl":"/go","primaryVariant":"solid","secondaryLabel":"More","secondaryUrl":"/more","alignment":"right"}',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.primaryLabel()).toBe('Start');
    expect(component.primaryUrl()).toBe('/go');
    expect(component.primaryVariant()).toBe('solid');
    expect(component.secondaryLabel()).toBe('More');
    expect(component.alignment()).toBe('right');
  });
});
