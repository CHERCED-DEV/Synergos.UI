import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { InfoBlockComponent } from './info-block';

describe('InfoBlockComponent', () => {
  let fixture: ComponentFixture<InfoBlockComponent>;
  let component: InfoBlockComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InfoBlockComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(InfoBlockComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should accept title input', async () => {
    fixture.componentRef.setInput('title', 'Info Title');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.title()).toBe('Info Title');
  });
});
