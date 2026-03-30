import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestimonialSectionComponent } from './testimonial-section';

describe('TestimonialSectionComponent', () => {
  let fixture: ComponentFixture<TestimonialSectionComponent>;
  let component: TestimonialSectionComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestimonialSectionComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(TestimonialSectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
