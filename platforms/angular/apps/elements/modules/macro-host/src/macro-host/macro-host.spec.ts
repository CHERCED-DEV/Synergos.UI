import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { MacroHostComponent } from './macro-host';
import { ElementMounter } from '@synergos/rendering';
import { InitialDataService } from '@synergos/core';

describe('MacroHostComponent', () => {
  let fixture: ComponentFixture<MacroHostComponent>;
  let component: MacroHostComponent;
  let mountBlockSpy: ReturnType<typeof vi.fn>;
  let parseValueSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mountBlockSpy = vi.fn().mockReturnValue(document.createElement('div'));
    parseValueSpy = vi.fn().mockReturnValue(null);

    await TestBed.configureTestingModule({
      imports: [MacroHostComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: ElementMounter,
          useValue: {
            mountBlock: mountBlockSpy,
            unmount: vi.fn(),
          },
        },
        {
          provide: InitialDataService,
          useValue: { parseValue: parseValueSpy },
        },
      ],
    }).compileComponents();

    fixture   = TestBed.createComponent(MacroHostComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call ElementMounter.mountBlock with type and raw data when contentType is set', async () => {
    const rawData = { heading: { headingText: 'Hello' } };
    parseValueSpy.mockReturnValue(rawData);

    fixture.componentRef.setInput('contentType', 'elementCompHero');
    fixture.componentRef.setInput('contentData', '{"heading":{"headingText":"Hello"}}');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(mountBlockSpy).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ type: 'elementCompHero', data: rawData }),
    );
  });

  it('should not call mountBlock when contentType is empty', async () => {
    fixture.componentRef.setInput('contentType', '');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(mountBlockSpy).not.toHaveBeenCalled();
  });

  it('should call mountBlock with empty data when contentData is invalid JSON', async () => {
    parseValueSpy.mockReturnValue(null);

    fixture.componentRef.setInput('contentType', 'elementCompCard');
    fixture.componentRef.setInput('contentData', 'not-json');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(mountBlockSpy).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ type: 'elementCompCard', data: {} }),
    );
  });

  it('should pass raw nested data to mountBlock without flattening', async () => {
    const rawData = {
      title: 'My Title',
      image: { src: '/img.jpg', alt: 'Photo' },
    };
    parseValueSpy.mockReturnValue(rawData);

    fixture.componentRef.setInput('contentType', 'elementCompCard');
    fixture.componentRef.setInput('contentData', '{"title":"My Title","image":{"src":"/img.jpg","alt":"Photo"}}');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(mountBlockSpy).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ type: 'elementCompCard', data: rawData }),
    );
  });
});
