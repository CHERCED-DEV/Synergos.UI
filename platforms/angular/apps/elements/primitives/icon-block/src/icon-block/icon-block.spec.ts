import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { IconBlockComponent } from './icon-block';

describe('IconBlockComponent', () => {
  let fixture: ComponentFixture<IconBlockComponent>;
  let component: IconBlockComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IconBlockComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(IconBlockComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
