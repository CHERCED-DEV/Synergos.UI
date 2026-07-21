import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  LogoCloudElementComponent,
  normalizeItems,
  readPositiveInteger,
  sanitizeLogoCloudConfig,
} from './logo-cloud';

describe('LogoCloudElementComponent', () => {
  let fixture: ComponentFixture<LogoCloudElementComponent>;
  let component: LogoCloudElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LogoCloudElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(LogoCloudElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should read config payloads', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"headingText":"Trusted by","body":"<p>Global teams.</p>","columns":3,"theme":"dark","items":[{"src":"logo.svg","label":"Acme","href":"https://example.com"}]}',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.headingText()).toBe('Trusted by');
    expect(component.resolvedColumns()).toBe(3);
    expect(component.parsedItems()[0]?.label).toBe('Acme');
  });

  it('should parse direct items json input', async () => {
    fixture.componentRef.setInput('items', '[{"src":"logo.svg","label":"Acme"}]');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.parsedItems()).toEqual([
      {
        src: 'logo.svg',
        alt: '',
        label: 'Acme',
        href: '',
        target: '_self',
      },
    ]);
  });

  it('should render item cards', async () => {
    fixture.componentRef.setInput('items', '[{"src":"logo-a.svg"},{"src":"logo-b.svg"}]');
    fixture.detectChanges();
    await fixture.whenStable();

    const items = fixture.nativeElement.querySelectorAll('.logo-cloud__item');
    expect(items.length).toBe(2);
  });

  it('should sanitize columns and filter malformed logo items', () => {
    const config = sanitizeLogoCloudConfig({
      headingText: '  Trusted by  ',
      columns: 5,
      items: [{ src: 'logo.svg', label: 'Acme' }, { label: 'Broken' }],
    });

    expect(config.headingText).toBe('Trusted by');
    expect(config.columns).toBe(5);
    expect(normalizeItems(config.items)).toEqual([
      {
        src: 'logo.svg',
        alt: '',
        label: 'Acme',
        href: '',
        target: '_self',
      },
    ]);
  });

  it('should normalize positive integer values from string and reject invalid ones', () => {
    expect(readPositiveInteger('6')).toBe(6);
    expect(readPositiveInteger(3.8)).toBe(3);
    expect(readPositiveInteger('0')).toBeUndefined();
    expect(readPositiveInteger('bad')).toBeUndefined();
  });
});
