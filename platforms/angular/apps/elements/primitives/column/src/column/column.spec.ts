import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ColumnComponent } from './column';

describe('ColumnComponent', () => {
  let fixture: ComponentFixture<ColumnComponent>;
  let component: ColumnComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ColumnComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(ColumnComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should read config payloads', async () => {
    fixture.componentRef.setInput('config', '{"width":"20rem","padding":"lg"}');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.width()).toBe('20rem');
    expect(component.padding()).toBe('lg');
  });
});
