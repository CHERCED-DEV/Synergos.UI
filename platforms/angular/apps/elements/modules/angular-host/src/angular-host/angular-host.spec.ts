import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { AngularHostElementComponent } from './angular-host';
import { CustomElementHostService, InitialDataService } from '@synergos/core';

describe('AngularHostElementComponent', () => {
  let fixture: ComponentFixture<AngularHostElementComponent>;
  let component: AngularHostElementComponent;
  let mountSpy: ReturnType<typeof vi.fn>;
  let unmountSpy: ReturnType<typeof vi.fn>;
  let parseValueSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mountSpy = vi.fn().mockReturnValue(document.createElement('div'));
    unmountSpy = vi.fn();
    parseValueSpy = vi.fn().mockReturnValue({});

    await TestBed.configureTestingModule({
      imports: [AngularHostElementComponent],
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
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AngularHostElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should mount a custom element from direct inputs', async () => {
    parseValueSpy.mockReturnValue({ theme: 'dark' });

    fixture.componentRef.setInput('component', 'elementCompHero');
    fixture.componentRef.setInput('endpoint', '/api/hero');
    fixture.componentRef.setInput('params', '{"theme":"dark"}');
    fixture.componentRef.setInput('props', '{"theme":"dark"}');
    fixture.componentRef.setInput('textContent', 'Hello');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(mountSpy).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        component: 'elementCompHero',
        props: { theme: 'dark', endpoint: '/api/hero' },
        textContent: 'Hello',
      }),
    );
  });

  it('should mount from CMS-style config payloads', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"component":"elementCompCtaBanner","endpoint":"/api/banner","params":{"variant":"compact"}}',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(mountSpy).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        component: 'elementCompCtaBanner',
        props: { variant: 'compact', endpoint: '/api/banner' },
        textContent: '',
      }),
    );
  });

  it('should unmount on destroy', () => {
    fixture.destroy();
    expect(unmountSpy).toHaveBeenCalled();
  });
});
