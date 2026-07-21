import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TimelineItemElementComponent } from './timeline-item';

describe('TimelineItemElementComponent', () => {
  let fixture: ComponentFixture<TimelineItemElementComponent>;
  let component: TimelineItemElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TimelineItemElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(TimelineItemElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should read config payloads', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"headingText":"Launch","body":"<p>Platform release.</p>","date":"2026-04-01","variant":"compact","theme":"dark"}',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.headingText()).toBe('Launch');
    expect(component.date()).toBe('2026-04-01');
    expect(component.variant()).toBe('compact');
    expect(component.theme()).toBe('dark');
  });

  it('should let direct inputs override config', async () => {
    fixture.componentRef.setInput('config', '{"headingText":"Launch"}');
    fixture.componentRef.setInput('headingText', 'Retrospective');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.headingText()).toBe('Retrospective');
  });

  it('should render body markup', async () => {
    fixture.componentRef.setInput('body', '<p>Platform release.</p>');
    fixture.detectChanges();
    await fixture.whenStable();

    const body = fixture.nativeElement.querySelector('.timeline-item__body') as HTMLElement | null;
    expect(body?.innerHTML).toContain('Platform release');
  });
});
