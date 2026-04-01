import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SpacerComponent } from './spacer';

describe('SpacerComponent', () => {
  let fixture: ComponentFixture<SpacerComponent>;
  let component: SpacerComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SpacerComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(SpacerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should read config payloads', async () => {
    fixture.componentRef.setInput('config', '{"size":"xl","axis":"horizontal"}');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.size()).toBe('xl');
    expect(component.axis()).toBe('horizontal');
  });
});
