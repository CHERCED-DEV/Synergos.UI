import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SectionComponent } from './section';

describe('SectionComponent', () => {
  let fixture: ComponentFixture<SectionComponent>;
  let component: SectionComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SectionComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(SectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render heading when provided', async () => {
    fixture.componentRef.setInput('headingText', 'Featured Products');
    fixture.detectChanges();
    await fixture.whenStable();

    const heading = fixture.nativeElement.querySelector('.section__heading');
    expect(heading?.textContent?.trim()).toBe('Featured Products');
  });

  it('should use h2 as default heading level', async () => {
    fixture.componentRef.setInput('headingText', 'Test');
    fixture.detectChanges();
    await fixture.whenStable();

    const heading = fixture.nativeElement.querySelector('.section__heading h2');
    expect(heading?.tagName?.toLowerCase()).toBe('h2');
  });
});
