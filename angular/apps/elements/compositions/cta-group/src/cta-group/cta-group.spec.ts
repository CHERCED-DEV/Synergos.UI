import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { CtaGroupComponent } from './cta-group';

describe('CtaGroupComponent', () => {
  let fixture: ComponentFixture<CtaGroupComponent>;
  let component: CtaGroupComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CtaGroupComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(CtaGroupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
