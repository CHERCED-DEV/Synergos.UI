import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { MediaTextComponent } from './media-text';

describe('MediaTextComponent', () => {
  let fixture: ComponentFixture<MediaTextComponent>;
  let component: MediaTextComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MediaTextComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(MediaTextComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should accept headingText input', async () => {
    fixture.componentRef.setInput('headingText', 'Media Text');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.headingText()).toBe('Media Text');
  });
});
