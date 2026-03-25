import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { StackComponent } from './stack';

describe('StackComponent', () => {
  let fixture: ComponentFixture<StackComponent>;
  let component: StackComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StackComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(StackComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
