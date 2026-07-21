import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DividerComponent } from './divider';

describe('DividerComponent', () => {
  let fixture: ComponentFixture<DividerComponent>;
  let component: DividerComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DividerComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(DividerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should read config payloads', async () => {
    fixture.componentRef.setInput('config', '{"orientation":"vertical","inset":"md"}');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.orientation()).toBe('vertical');
    expect(component.inset()).toBe('md');
  });
});
