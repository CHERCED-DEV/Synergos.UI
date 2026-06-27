import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  AvatarGroupElementComponent,
  type AvatarSelectDetail,
  computeInitials,
  normalizeAvatars,
  normalizeSize,
} from './avatar-group';

const AVATARS = JSON.stringify([
  { name: 'Ada Lovelace', src: 'https://example.com/ada.jpg' },
  { name: 'Alan Turing' },
  { name: 'Grace Hopper', href: 'https://example.com/grace' },
  { name: 'Edsger Dijkstra' },
  { name: 'Donald Knuth' },
  { name: 'Barbara Liskov' },
  { name: 'Margaret Hamilton' },
  { src: '', name: '' }, // dropped: no name, no src
]);

describe('AvatarGroupElementComponent', () => {
  let fixture: ComponentFixture<AvatarGroupElementComponent>;
  let component: AvatarGroupElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AvatarGroupElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(AvatarGroupElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render nothing but an empty notice (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.isEmpty()).toBe(true);
    expect(component.total()).toBe(0);
    expect(component.visibleAvatars().length).toBe(0);
    expect(component.hasOverflow()).toBe(false);
  });

  it('should render visible faces and a "+N" overflow chip honoring maxVisible (render/config case)', async () => {
    fixture.componentRef.setInput('avatars', AVATARS);
    fixture.componentRef.setInput('maxVisible', 4);
    fixture.componentRef.setInput('size', 'lg');
    fixture.detectChanges();
    await fixture.whenStable();

    // 7 valid avatars (last entry dropped). With maxVisible=4, the 4th slot is
    // reserved for the chip → 3 faces + "+4".
    expect(component.total()).toBe(7);
    expect(component.size()).toBe('lg');
    expect(component.visibleAvatars().length).toBe(3);
    expect(component.hasOverflow()).toBe(true);
    expect(component.overflowCount()).toBe(4);
    expect(component.overflowLabel()).toBe('+4');
    expect(component.groupAriaLabel()).toContain('7 integrantes');
  });

  it('should select an avatar and emit avatarselect with the avatar + index (interaction case)', async () => {
    fixture.componentRef.setInput('avatars', AVATARS);
    fixture.componentRef.setInput('maxVisible', 5);
    fixture.detectChanges();
    await fixture.whenStable();

    let emitted: AvatarSelectDetail | undefined;
    component.avatarselect.subscribe((detail) => (emitted = detail));

    const first = component.visibleAvatars()[0];
    component.selectAvatar(first, 0);

    expect(emitted?.index).toBe(0);
    expect(emitted?.avatar.name).toBe('Ada Lovelace');
    expect(component.isFocusable(first, 0)).toBe(true);
  });

  it('should let direct inputs override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', '{"size":"sm","maxVisible":2,"label":"Comité"}');
    fixture.componentRef.setInput('size', 'lg');
    fixture.detectChanges();
    await fixture.whenStable();

    // Explicit attribute wins over config; unset attribute falls back to config.
    expect(component.size()).toBe('lg');
    expect(component.maxVisible()).toBe(2);
    expect(component.label()).toBe('Comité');
  });
});

describe('avatar-group pure helpers', () => {
  it('computeInitials builds two-letter initials and guards empties', () => {
    expect(computeInitials('Ada Lovelace')).toBe('AL');
    expect(computeInitials('Cher')).toBe('C');
    expect(computeInitials('   ')).toBe('?');
  });

  it('normalizeAvatars drops entries without a name or src and supports plain strings', () => {
    const avatars = normalizeAvatars([
      { name: 'Ok' },
      { src: 'https://example.com/x.jpg' },
      { name: '', src: '' },
      'Grace Hopper',
      42,
    ]);
    expect(avatars.length).toBe(3);
    expect(avatars[0].initials).toBe('O');
    expect(avatars[2].name).toBe('Grace Hopper');
  });

  it('normalizeSize clamps to the allowed set', () => {
    expect(normalizeSize('LG')).toBe('lg');
    expect(normalizeSize('huge')).toBe('md');
    expect(normalizeSize(undefined)).toBe('md');
  });
});
