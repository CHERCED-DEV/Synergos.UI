import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  SocialShareElementComponent,
  createDefaultLinks,
  normalizeLinks,
  sanitizeSocialShareConfig,
} from './social-share';

describe('SocialShareElementComponent', () => {
  let fixture: ComponentFixture<SocialShareElementComponent>;
  let component: SocialShareElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SocialShareElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(SocialShareElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should generate default links from a page url', async () => {
    fixture.componentRef.setInput('title', 'Share this page');
    fixture.componentRef.setInput('pageUrl', 'https://example.com/article');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.links().length).toBe(4);
    expect(component.links()[0]?.label).toBe('Facebook');
  });

  it('should parse direct links input', async () => {
    fixture.componentRef.setInput('links', '[{"label":"WhatsApp","href":"https://wa.me","iconSymbol":"chat"}]');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.links()).toEqual([
      {
        label: 'WhatsApp',
        href: 'https://wa.me',
        iconSymbol: 'chat',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    ]);
  });

  it('should filter malformed links and normalize layout from config', () => {
    const config = sanitizeSocialShareConfig({
      title: '  Share  ',
      layout: 'stack',
      links: [
        { label: 'LinkedIn', href: 'https://linkedin.com', iconSymbol: 'linkedin' },
        { label: '', href: 'https://invalid.test' },
        { label: 'Broken' },
      ],
    });

    expect(config.title).toBe('Share');
    expect(config.layout).toBe('stack');
    expect(normalizeLinks(config.links)).toEqual([
      {
        label: 'LinkedIn',
        href: 'https://linkedin.com',
        iconSymbol: 'linkedin',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    ]);
  });

  it('should generate deterministic default links with email staying in same tab', () => {
    const links = createDefaultLinks('https://example.com/post', 'New article');

    expect(links).toHaveLength(4);
    expect(links[3]).toEqual(
      expect.objectContaining({
        label: 'Email',
        target: '_self',
      }),
    );
  });
});
