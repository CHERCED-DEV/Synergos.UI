import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TextBlockComponent } from './text-block';

describe('TextBlockComponent', () => {
  let fixture: ComponentFixture<TextBlockComponent>;
  let component: TextBlockComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TextBlockComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(TextBlockComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should accept headingText input', async () => {
    fixture.componentRef.setInput('headingText', 'Hello');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.headingText()).toBe('Hello');
  });
});
