import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GalleryItemElementComponent } from './gallery-item';

describe('GalleryItemElementComponent', () => {
  let fixture: ComponentFixture<GalleryItemElementComponent>;
  let component: GalleryItemElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GalleryItemElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(GalleryItemElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should read config payloads', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"src":"photo.jpg","alt":"Team photo","caption":"<strong>Launch day</strong>","aspectRatio":"16 / 9"}',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.src()).toBe('photo.jpg');
    expect(component.resolvedAlt()).toBe('Team photo');
    expect(component.aspectRatio()).toBe('16 / 9');
  });

  it('should let direct inputs override config', async () => {
    fixture.componentRef.setInput('config', '{"aspectRatio":"16 / 9"}');
    fixture.componentRef.setInput('aspectRatio', '1 / 1');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.aspectRatio()).toBe('1 / 1');
  });

  it('should render caption markup', async () => {
    fixture.componentRef.setInput('caption', '<strong>Launch day</strong>');
    fixture.detectChanges();
    await fixture.whenStable();

    const caption = fixture.nativeElement.querySelector('.gallery-item__caption') as HTMLElement | null;
    expect(caption?.innerHTML).toContain('Launch day');
  });
});
