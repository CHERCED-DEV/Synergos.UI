import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SocialShareElementComponent } from './social-share';

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
});
