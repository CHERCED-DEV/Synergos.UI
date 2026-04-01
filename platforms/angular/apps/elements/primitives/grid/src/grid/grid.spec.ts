import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GridComponent } from './grid';

describe('GridComponent', () => {
  let fixture: ComponentFixture<GridComponent>;
  let component: GridComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GridComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(GridComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should enable auto fit when a minimum column width is provided', async () => {
    fixture.componentRef.setInput('minColumnWidth', '18rem');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.autoFit()).toBe(true);
  });
});
