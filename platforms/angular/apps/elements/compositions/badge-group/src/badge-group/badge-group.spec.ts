import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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

  it('should let direct inputs override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', '{"label":"Config label","layout":"stack"}');
    fixture.componentRef.setInput('label', 'Input label');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.label()).toBe('Input label');
    expect(component.layout()).toBe('stack');

    // Re-resolving the same inputs yields a stable result (idempotent).
    const first = component.layout();
    fixture.detectChanges();
    expect(component.layout()).toBe(first);
  });
});
