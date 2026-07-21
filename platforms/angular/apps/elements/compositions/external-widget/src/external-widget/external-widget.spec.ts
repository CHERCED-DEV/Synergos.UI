import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ExternalWidgetElementComponent } from './external-widget';
import {
  CustomElementHostService,
  InitialDataService,
  ScriptService,
} from '@synergos/core';

describe('ExternalWidgetElementComponent', () => {
  let fixture: ComponentFixture<ExternalWidgetElementComponent>;
  let component: ExternalWidgetElementComponent;
  let mountSpy: ReturnType<typeof vi.fn>;
  let unmountSpy: ReturnType<typeof vi.fn>;
  let parseValueSpy: ReturnType<typeof vi.fn>;
  let addScriptSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mountSpy = vi.fn().mockReturnValue(document.createElement('div'));
    unmountSpy = vi.fn();
    parseValueSpy = vi.fn().mockReturnValue({});
    addScriptSpy = vi.fn();

    await TestBed.configureTestingModule({
      imports: [ExternalWidgetElementComponent],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: CustomElementHostService,
          useValue: {
            mount: mountSpy,
            unmount: unmountSpy,
          },
        },
        {
          provide: InitialDataService,
          useValue: { parseValue: parseValueSpy },
        },
        {
          provide: ScriptService,
          useValue: { addScript: addScriptSpy },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExternalWidgetElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load widget script and mount host', async () => {
    parseValueSpy.mockReturnValue({ locale: 'es' });

    fixture.componentRef.setInput('tagName', 'booking-widget');
    fixture.componentRef.setInput('scriptSrc', 'https://cdn.example.com/widget.js');
    fixture.componentRef.setInput('props', '{"locale":"es"}');
    fixture.componentRef.setInput('textContent', 'Loading');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(addScriptSpy).toHaveBeenCalledWith(
      expect.objectContaining({ src: 'https://cdn.example.com/widget.js' }),
    );
    expect(mountSpy).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        tagName: 'booking-widget',
        props: { locale: 'es' },
        textContent: 'Loading',
      }),
    );
  });

  it('should mount from config payloads', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"type":"booking-widget","src":"https://cdn.example.com/widget.js","title":"Ready","endpoint":"https://api.example.com/widget"}',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(addScriptSpy).toHaveBeenCalledWith(
      expect.objectContaining({ src: 'https://cdn.example.com/widget.js' }),
    );
    expect(mountSpy).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        tagName: 'booking-widget',
        props: { endpoint: 'https://api.example.com/widget' },
        textContent: 'Ready',
      }),
    );
  });

  it('should unmount on destroy', () => {
    fixture.destroy();
    expect(unmountSpy).toHaveBeenCalled();
  });
});
