import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ButtonContainerComponent } from './button-container';

describe('ButtonContainerComponent', () => {
  let fixture: ComponentFixture<ButtonContainerComponent>;
  let component: ButtonContainerComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ButtonContainerComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(ButtonContainerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
