import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VideoBlockComponent } from './video-block';

describe('VideoBlockComponent', () => {
  let fixture: ComponentFixture<VideoBlockComponent>;
  let component: VideoBlockComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VideoBlockComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(VideoBlockComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should read config payloads', async () => {
    fixture.componentRef.setInput('config', '{"src":"video.mp4","muted":true}');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.src()).toBe('video.mp4');
    expect(component.muted()).toBe(true);
  });
});
