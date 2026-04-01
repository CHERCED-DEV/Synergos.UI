import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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

  it('should normalize testimonial items from JSON', async () => {
    fixture.componentRef.setInput(
      'items',
      '[{"name":"Ada Lovelace","quote":"Elegant and solid.","role":"Engineer"}]',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.parsedItems()).toEqual([
      {
        name: 'Ada Lovelace',
        quote: 'Elegant and solid.',
        role: 'Engineer',
        avatarSrc: '',
      },
    ]);
  });
});
