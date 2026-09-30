import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BADGE_GROUP_SYNHOST } from '@synergos/contracts';
import { BadgeGroupElementComponent, type BadgeSelectDetail } from './badge-group';

const BADGES = JSON.stringify([
  { id: 'open', label: 'Abiertos', count: 12, tone: 'success' },
  { id: 'closed', label: 'Cerrados', count: 1200, tone: 'neutral' },
  { id: 'urgent', label: 'Urgentes', count: 3, tone: 'danger', href: '/urgentes' },
]);

describe('BadgeGroupElementComponent', () => {
  let fixture: ComponentFixture<BadgeGroupElementComponent>;
  let component: BadgeGroupElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BadgeGroupElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(BadgeGroupElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and resolve to no badges (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.badges()).toEqual([]);
    expect(component.hasBadges()).toBe(false);
    expect(component.totalCount()).toBe(0);
  });

  it('should normalize badges with formatted counts from config (render+config case)', async () => {
    fixture.componentRef.setInput('badges', BADGES);
    fixture.detectChanges();
    await fixture.whenStable();

    const badges = component.badges();
    expect(badges.length).toBe(3);
    expect(badges[0].label).toBe('Abiertos');
    expect(badges[0].countLabel).toBe('12');
    expect(badges[1].countLabel).toBe('1,2k');
    expect(badges[2].tone).toBe('danger');
    expect(badges[2].href).toBe('/urgentes');
    expect(component.totalCount()).toBe(1215);
  });

  it('should toggle selection and emit badgeselect (interaction case)', async () => {
    fixture.componentRef.setInput('badges', BADGES);
    fixture.componentRef.setInput('selectable', true);
    fixture.componentRef.setInput('multiple', true);
    fixture.detectChanges();
    await fixture.whenStable();

    const emissions: BadgeSelectDetail[] = [];
    component.badgeselect.subscribe((detail) => emissions.push(detail));

    const [first, second] = component.badges();
    component.toggle(first);
    component.toggle(second);

    expect(component.isSelected('open')).toBe(true);
    expect(component.isSelected('closed')).toBe(true);
    expect(emissions.length).toBe(2);
    expect(emissions[1].selectedIds).toEqual(['open', 'closed']);

    component.toggle(first);
    expect(component.isSelected('open')).toBe(false);
  });

  // D1: con `badgesJson` —el TEXTO que mandaba la vista— este elemento hidrataba con «No hay
  // elementos.». Éste alimenta el `config` EXACTO que emite hoy la vista del CMS.
  it('pinta las insignias que el editor autoró con el config exacto que emite la vista del CMS', async () => {
    const { ejemplo } = BADGE_GROUP_SYNHOST;
    fixture.componentRef.setInput('config', JSON.stringify(ejemplo));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.badges().map((badge) => badge.label)).toEqual(ejemplo.badges?.map((badge) => badge.label));
    expect(component.badges().map((badge) => badge.tone)).toEqual(ejemplo.badges?.map((badge) => badge.tone));
    expect(component.layout()).toBe(ejemplo.layout);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('.badge').length).toBe(ejemplo.badges?.length);
    expect(host.querySelector('.badge-group__empty')).toBeNull();
  });

  // `label` no lo autora el editor en el CMS (ADR 0135): es atributo. `layout` sí viaja.
  it('should let direct inputs override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', '{"layout":"stack"}');
    fixture.componentRef.setInput('layout', 'inline');
    fixture.componentRef.setInput('label', 'Input label');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.label()).toBe('Input label');
    expect(component.layout()).toBe('inline');

    // Re-resolving the same inputs yields a stable result (idempotent).
    const first = component.layout();
    fixture.detectChanges();
    expect(component.layout()).toBe(first);
  });
});
