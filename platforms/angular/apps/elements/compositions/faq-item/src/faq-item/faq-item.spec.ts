import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FaqItemElementComponent } from './faq-item';

describe('FaqItemElementComponent', () => {
  let fixture: ComponentFixture<FaqItemElementComponent>;
  let component: FaqItemElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FaqItemElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(FaqItemElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should read config payloads', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"question":"What is included?","answer":"<p>Support and setup.</p>","initiallyExpanded":true,"theme":"dark"}',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.question()).toBe('What is included?');
    expect(component.initiallyExpanded()).toBe(true);
    expect(component.accordionTone()).toBe('brand');
  });

  it('should coerce boolean attribute inputs', async () => {
    fixture.componentRef.setInput('initiallyExpanded', 'true');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.initiallyExpanded()).toBe(true);
  });

  it('should render answer markup', async () => {
    fixture.componentRef.setInput('question', 'What is included?');
    fixture.componentRef.setInput('answer', '<p>Trusted answer</p>');
    fixture.detectChanges();
    await fixture.whenStable();

    const trigger = fixture.nativeElement.querySelector('.syn-accordion__trigger') as HTMLButtonElement | null;
    trigger?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const answer = fixture.nativeElement.querySelector('.faq-item__answer') as HTMLElement | null;
    expect(answer?.innerHTML).toContain('Trusted answer');
  });
});
