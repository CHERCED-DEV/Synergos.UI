import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TestimonialItemElementComponent } from './testimonial-item';

describe('TestimonialItemElementComponent', () => {
  let fixture: ComponentFixture<TestimonialItemElementComponent>;
  let component: TestimonialItemElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestimonialItemElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(TestimonialItemElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should read config payloads', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"quote":"<p>Excellent support.</p>","name":"Ana Ruiz","role":"Product Lead","avatarSrc":"avatar.png","theme":"dark"}',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.name()).toBe('Ana Ruiz');
    expect(component.role()).toBe('Product Lead');
    expect(component.avatarSrc()).toBe('avatar.png');
    expect(component.theme()).toBe('dark');
  });

  it('should derive avatar alt from name when absent', async () => {
    fixture.componentRef.setInput('name', 'Ana Ruiz');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.resolvedAvatarAlt()).toBe('Ana Ruiz avatar');
  });

  it('should render author meta', async () => {
    fixture.componentRef.setInput('name', 'Ana Ruiz');
    fixture.componentRef.setInput('role', 'Product Lead');
    fixture.detectChanges();
    await fixture.whenStable();

    const role = fixture.nativeElement.querySelector('.testimonial-item__role') as HTMLElement | null;
    expect(role?.textContent).toContain('Product Lead');
  });
});
