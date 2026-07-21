import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { FeatureItemComponent } from './feature-item';

describe('FeatureItemComponent', () => {
  let fixture: ComponentFixture<FeatureItemComponent>;
  let component: FeatureItemComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeatureItemComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(FeatureItemComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should accept headingText input', async () => {
    fixture.componentRef.setInput('headingText', 'Feature');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.headingText()).toBe('Feature');
  });
});
