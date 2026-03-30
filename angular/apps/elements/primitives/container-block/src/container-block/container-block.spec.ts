import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ContainerBlockComponent } from './container-block';

describe('ContainerBlockComponent', () => {
  let fixture: ComponentFixture<ContainerBlockComponent>;
  let component: ContainerBlockComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContainerBlockComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(ContainerBlockComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
