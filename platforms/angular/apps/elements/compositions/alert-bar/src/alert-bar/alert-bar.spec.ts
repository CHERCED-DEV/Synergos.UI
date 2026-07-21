import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AlertBarElementComponent } from './alert-bar';

describe('AlertBarElementComponent', () => {
  let fixture: ComponentFixture<AlertBarElementComponent>;
  let component: AlertBarElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AlertBarElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(AlertBarElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should read config payloads', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"title":"Heads up","description":"Body","tone":"critical","dismissible":false}',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.title()).toBe('Heads up');
    expect(component.tone()).toBe('critical');
    expect(component.dismissible()).toBe(false);
  });

  it('should render link when cta is provided', async () => {
    fixture.componentRef.setInput('ctaLabel', 'View');
    fixture.componentRef.setInput('ctaUrl', 'https://example.com');
    fixture.detectChanges();
    await fixture.whenStable();

    const link = fixture.nativeElement.querySelector('.alert-bar__link');
    expect(link).toBeTruthy();
  });
});
