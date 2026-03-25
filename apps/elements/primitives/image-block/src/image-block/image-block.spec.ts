import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ImageBlockComponent } from './image-block';

describe('ImageBlockComponent', () => {
  let fixture: ComponentFixture<ImageBlockComponent>;
  let component: ImageBlockComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ImageBlockComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(ImageBlockComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should accept src input', async () => {
    fixture.componentRef.setInput('src', 'test.png');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.src()).toBe('test.png');
  });
});
