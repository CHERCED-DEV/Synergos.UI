import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SocialProofElementComponent, normalizePeople } from './social-proof';

const PEOPLE = JSON.stringify([
  { name: 'Ana Gómez', image: 'https://example.com/ana.jpg' },
  { name: 'Luis Pérez' },
  'María Ruiz',
  { alt: 'sin nombre' },
  { image: 'https://example.com/anon.jpg', alt: 'Anónimo' },
]);

describe('SocialProofElementComponent', () => {
  let fixture: ComponentFixture<SocialProofElementComponent>;
  let component: SocialProofElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SocialProofElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(SocialProofElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with no avatars and no count (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasAvatars()).toBe(false);
    expect(component.hasCount()).toBe(false);
    expect(component.people().length).toBe(0);
    expect(component.targetCount()).toBe(0);
  });

  it('should render the avatar stack and a localized count (render/config case)', async () => {
    fixture.componentRef.setInput('count', 1200);
    fixture.componentRef.setInput('label', 'profesionales activos');
    fixture.componentRef.setInput('maxAvatars', 3);
    fixture.componentRef.setInput('animate', false);
    fixture.componentRef.setInput('people', PEOPLE);
    fixture.detectChanges();
    await fixture.whenStable();

    // 4 valid people survive (the one with only `alt` is dropped).
    expect(component.people().length).toBe(4);
    expect(component.visibleAvatars().length).toBe(3);
    expect(component.overflowCount()).toBe(1);
    expect(component.overflowLabel()).toBe('+1');

    expect(component.hasCount()).toBe(true);
    // animate=false → counter jumps to the target, formatted es-CO.
    expect(component.displayCount()).toBe(1200);
    expect(component.formattedCount()).toContain('200');
    expect(component.label()).toBe('profesionales activos');
  });

  it('should jump the counter to the target when animation is disabled (interaction case)', async () => {
    fixture.componentRef.setInput('count', 50);
    fixture.componentRef.setInput('animate', false);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.displayCount()).toBe(50);
    expect(component.formattedCount()).toBe('50');
    expect(component.ariaSummary()).toContain('50');
  });

  it('should let direct inputs override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', '{"locale":"en-US","count":99,"label":"from config"}');
    fixture.componentRef.setInput('locale', 'es-CO');
    fixture.componentRef.setInput('label', 'desde input');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.locale()).toBe('es-CO');
    expect(component.label()).toBe('desde input');
    // Config-only value flows through when no direct input is present.
    expect(component.targetCount()).toBe(99);
  });
});

describe('social-proof pure helpers', () => {
  it('normalizePeople accepts strings and records, drops entries without name or image', () => {
    const people = normalizePeople([
      'Ana',
      { name: 'Luis' },
      { image: 'x.jpg', alt: 'foto' },
      { alt: 'solo alt' },
      42,
    ]);
    expect(people.length).toBe(3);
    expect(people[0]).toEqual({ name: 'Ana', image: '', alt: 'Ana' });
    expect(people[2].image).toBe('x.jpg');
  });

  it('normalizePeople returns empty for non-array input', () => {
    expect(normalizePeople(undefined).length).toBe(0);
    expect(normalizePeople('nope').length).toBe(0);
  });
});
