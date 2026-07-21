import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  NewsletterFormElementComponent,
  isValidEmail,
  normalizeMethod,
  sanitizeNewsletterFormConfig,
} from './newsletter-form';

describe('NewsletterFormElementComponent', () => {
  let fixture: ComponentFixture<NewsletterFormElementComponent>;
  let component: NewsletterFormElementComponent;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await TestBed.configureTestingModule({
      imports: [NewsletterFormElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(NewsletterFormElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should read config payloads', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"title":"Stay informed","submitLabel":"Join","theme":"dark","method":"get"}',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.title()).toBe('Stay informed');
    expect(component.submitLabel()).toBe('Join');
    expect(component.theme()).toBe('dark');
    expect(component.method()).toBe('get');
  });

  it('should reject invalid email submissions', async () => {
    component.onEmailChange('invalid-email');

    await component.onSubmit(new Event('submit'));

    expect(component.state()).toBe('error');
    expect(component.feedback()).toBe(component.errorMessage());
  });

  it('should submit successfully without remote action url', async () => {
    component.onEmailChange('ana@example.com');

    await component.onSubmit(new Event('submit'));

    expect(component.state()).toBe('success');
    expect(component.feedback()).toBe(component.successMessage());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should call fetch when action url is configured', async () => {
    fetchSpy.mockResolvedValue({ ok: true });
    fixture.componentRef.setInput('actionUrl', 'https://example.com/newsletter');
    fixture.componentRef.setInput('method', 'post');
    fixture.detectChanges();
    await fixture.whenStable();

    component.onEmailChange('ana@example.com');
    await component.onSubmit(new Event('submit'));

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com/newsletter',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('should normalize method casing and trim config values', () => {
    const config = sanitizeNewsletterFormConfig({
      title: '  Stay informed  ',
      actionUrl: ' https://example.com/newsletter ',
      method: 'GET',
    });

    expect(config.title).toBe('Stay informed');
    expect(config.actionUrl).toBe('https://example.com/newsletter');
    expect(config.method).toBe('get');
  });

  it('should build a GET request url with email and consent', async () => {
    fetchSpy.mockResolvedValue({ ok: true });
    fixture.componentRef.setInput('actionUrl', '/newsletter');
    fixture.componentRef.setInput('method', 'GET');
    fixture.componentRef.setInput('consentText', 'I agree');
    fixture.detectChanges();
    await fixture.whenStable();

    component.onEmailChange('ana@example.com');
    component.onConsentChange(true);
    await component.onSubmit(new Event('submit'));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const url = new URL(requestUrl);

    expect(url.pathname).toBe('/newsletter');
    expect(url.searchParams.get('email')).toBe('ana@example.com');
    expect(url.searchParams.get('consent')).toBe('true');
    expect(requestInit).toEqual(expect.objectContaining({ method: 'GET' }));
  });

  it('should expose pure validation helpers', () => {
    expect(normalizeMethod(' GET ')).toBe('get');
    expect(normalizeMethod('post')).toBe('post');
    expect(isValidEmail('ana@example.com')).toBe(true);
    expect(isValidEmail('invalid-email')).toBe(false);
  });
});
