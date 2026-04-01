import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { MfHostElementComponent } from './mf-host';
import {
  CustomElementHostService,
  InitialDataService,
  ScriptService,
} from '@synergos/core';

describe('MfHostElementComponent', () => {
  let fixture: ComponentFixture<MfHostElementComponent>;
  let component: MfHostElementComponent;
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
      imports: [MfHostElementComponent],
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

    fixture = TestBed.createComponent(MfHostElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load remote entry and mount the remote host', async () => {
    parseValueSpy.mockReturnValue({ locale: 'en' });

    fixture.componentRef.setInput('remoteEntry', 'https://cdn.example.com/remote.js');
    fixture.componentRef.setInput('tagName', 'remote-banner');
    fixture.componentRef.setInput('props', '{"locale":"en"}');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(addScriptSpy).toHaveBeenCalledWith(
      expect.objectContaining({ src: 'https://cdn.example.com/remote.js' }),
    );
    expect(mountSpy).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        tagName: 'remote-banner',
        props: { locale: 'en' },
      }),
    );
  });

  it('should mount from config payloads', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"remoteEntry":"https://cdn.example.com/remote.js","tagName":"remote-banner","props":{"theme":"dark"}}',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(mountSpy).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        tagName: 'remote-banner',
        props: { theme: 'dark' },
      }),
    );
  });

  it('should unmount on destroy', () => {
    fixture.destroy();
    expect(unmountSpy).toHaveBeenCalled();
  });
});
