import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { KeyValueElementComponent } from './key-value';

describe('KeyValueElementComponent', () => {
  let fixture: ComponentFixture<KeyValueElementComponent>;
  let component: KeyValueElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KeyValueElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(KeyValueElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should read config payloads', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"label":"Plan","value":"Premium","helpText":"Billed monthly","theme":"dark"}',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.label()).toBe('Plan');
    expect(component.value()).toBe('Premium');
    expect(component.items()[0]).toEqual({
      term: 'Plan',
      description: 'Premium',
      detail: 'Billed monthly',
      emphasis: 'brand',
    });
  });

  it('should let direct inputs override config', async () => {
    fixture.componentRef.setInput('config', '{"label":"Plan","value":"Starter"}');
    fixture.componentRef.setInput('value', 'Enterprise');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.value()).toBe('Enterprise');
  });
});
