import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BadgeElementComponent } from './badge';

describe('BadgeElementComponent', () => {
  let fixture: ComponentFixture<BadgeElementComponent>;
  let component: BadgeElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BadgeElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(BadgeElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should read config payloads', async () => {
    fixture.componentRef.setInput('config', '{"text":"New","tone":"brand"}');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.text()).toBe('New');
    expect(component.tone()).toBe('brand');
  });
});
