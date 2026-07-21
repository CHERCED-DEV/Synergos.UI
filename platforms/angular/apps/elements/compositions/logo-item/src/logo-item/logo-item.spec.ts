import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LogoItemElementComponent } from './logo-item';

describe('LogoItemElementComponent', () => {
  let fixture: ComponentFixture<LogoItemElementComponent>;
  let component: LogoItemElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LogoItemElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(LogoItemElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should read config payloads', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"src":"logo.svg","alt":"Acme","href":"https://example.com","label":"Acme","target":"_blank"}',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.href()).toBe('https://example.com');
    expect(component.target()).toBe('_blank');
    expect(component.resolvedAlt()).toBe('Acme');
  });

  it('should derive aria label when label is missing', async () => {
    fixture.componentRef.setInput('alt', 'Acme');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.resolvedAriaLabel()).toBe('Acme');
  });

  it('should render a static frame when href is missing', async () => {
    fixture.componentRef.setInput('label', 'Acme');
    fixture.detectChanges();
    await fixture.whenStable();

    const link = fixture.nativeElement.querySelector('a');
    const frame = fixture.nativeElement.querySelector('.logo-item__frame');
    expect(link).toBeNull();
    expect(frame).toBeTruthy();
  });
});
