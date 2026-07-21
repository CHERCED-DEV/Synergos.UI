import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CarouselElementComponent } from './carousel';

describe('CarouselElementComponent', () => {
  let fixture: ComponentFixture<CarouselElementComponent>;
  let component: CarouselElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CarouselElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(CarouselElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and resolve to no slides (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.slides()).toEqual([]);
    expect(component.hasSlides()).toBe(false);
  });

  it('should read config payloads, dropping slides without a src (happy + filter case)', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"title":"Recorrido","slides":[{"src":"a.jpg","alt":"Sala"},{"alt":"sin src"},{"src":"b.mp4","type":"video"}]}',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.title()).toBe('Recorrido');
    const slides = component.slides();
    expect(slides.length).toBe(2);
    expect(slides[0].src).toBe('a.jpg');
    expect(slides[1].type).toBe('video');
  });

  it('should parse slides from the slides attribute', async () => {
    fixture.componentRef.setInput('slides', '[{"src":"x.jpg"},{"src":"y.jpg"}]');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.slides().length).toBe(2);
    expect(component.hasSlides()).toBe(true);
  });

  it('should let direct inputs override config', async () => {
    fixture.componentRef.setInput('config', '{"title":"Config title"}');
    fixture.componentRef.setInput('title', 'Input title');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.title()).toBe('Input title');
  });

  it('should clamp interval to a sane minimum', async () => {
    fixture.componentRef.setInput('interval', 100);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.interval()).toBe(5000);
  });
});
