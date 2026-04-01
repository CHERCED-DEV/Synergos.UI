import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DateDisplayComponent } from './date-display';

describe(DateDisplayComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DateDisplayComponent],
      providers: [{ provide: LOCALE_ID, useValue: 'en-US' }],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(DateDisplayComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders formatted date parts', () => {
    const fixture = TestBed.createComponent(DateDisplayComponent);
    fixture.componentRef.setInput('value', '2026-03-31T12:00:00Z');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Mar');
    expect(fixture.nativeElement.textContent).toContain('31');
    expect(fixture.nativeElement.textContent).toContain('2026');
  });

  it('renders the weekday when enabled', () => {
    const fixture = TestBed.createComponent(DateDisplayComponent);
    fixture.componentRef.setInput('value', '2026-03-31T12:00:00Z');
    fixture.componentRef.setInput('showWeekday', true);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Tue');
  });
});
