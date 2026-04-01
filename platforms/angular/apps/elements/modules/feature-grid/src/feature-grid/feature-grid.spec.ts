import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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

  it('should normalize feature items from JSON', async () => {
    fixture.componentRef.setInput(
      'items',
      '[{"heading":"Fast","body":"Loads quickly.","icon":"icon-speed"}]',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.parsedItems()).toEqual([
      {
        heading: 'Fast',
        body: 'Loads quickly.',
        icon: 'icon-speed',
      },
    ]);
  });
});
