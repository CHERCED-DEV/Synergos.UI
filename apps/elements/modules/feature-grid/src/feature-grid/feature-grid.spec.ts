import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { FeatureGridComponent } from './feature-grid';

describe('FeatureGridComponent', () => {
  let fixture: ComponentFixture<FeatureGridComponent>;
  let component: FeatureGridComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeatureGridComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(FeatureGridComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
