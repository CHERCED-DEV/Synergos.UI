import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { MacroHostComponent } from './macro-host';

describe('MacroHostComponent', () => {
  let fixture: ComponentFixture<MacroHostComponent>;
  let component: MacroHostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MacroHostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(MacroHostComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should resolve content type to tag', async () => {
    fixture.componentRef.setInput('contentType', 'elementCompHero');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.resolvedTag()).toBe('synergos-hero');
  });

  it('should parse content data', async () => {
    fixture.componentRef.setInput('contentData', '{"title":"Test"}');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.parsedData()).toEqual({ title: 'Test' });
  });

  it('should handle invalid JSON gracefully', async () => {
    fixture.componentRef.setInput('contentData', 'not-json');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.parsedData()).toBeNull();
  });
});
