import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FaqSectionComponent } from './faq-section';

describe('FaqSectionComponent', () => {
  let fixture: ComponentFixture<FaqSectionComponent>;
  let component: FaqSectionComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FaqSectionComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(FaqSectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should normalize faq items from JSON', async () => {
    fixture.componentRef.setInput(
      'items',
      '[{"question":"What is Synergos?","answer":"A design system.","initiallyExpanded":true}]',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.parsedItems()).toEqual([
      {
        question: 'What is Synergos?',
        answer: 'A design system.',
        initiallyExpanded: true,
      },
    ]);
  });
});
