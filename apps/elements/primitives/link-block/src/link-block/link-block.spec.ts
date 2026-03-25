import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { LinkBlockComponent } from './link-block';

describe('LinkBlockComponent', () => {
  let fixture: ComponentFixture<LinkBlockComponent>;
  let component: LinkBlockComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LinkBlockComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(LinkBlockComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should accept href input', async () => {
    fixture.componentRef.setInput('href', 'https://example.com');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.href()).toBe('https://example.com');
  });
});
