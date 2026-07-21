import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IframeEmbedElementComponent } from './iframe-embed';

describe('IframeEmbedElementComponent', () => {
  let fixture: ComponentFixture<IframeEmbedElementComponent>;
  let component: IframeEmbedElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IframeEmbedElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(IframeEmbedElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should read config payloads', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"src":"https://example.com","title":"Widget","height":"640px","allowFullscreen":false}',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.src()).toBe('https://example.com');
    expect(component.height()).toBe('640px');
    expect(component.allowFullscreen()).toBe(false);
  });

  it('should render iframe attributes', async () => {
    fixture.componentRef.setInput('src', 'https://example.com/embed');
    fixture.componentRef.setInput('title', 'Example');
    fixture.detectChanges();
    await fixture.whenStable();

    const iframe = fixture.nativeElement.querySelector('iframe');
    expect(iframe?.getAttribute('src')).toContain('https://example.com/embed');
    expect(iframe?.getAttribute('title')).toBe('Example');
  });
});
