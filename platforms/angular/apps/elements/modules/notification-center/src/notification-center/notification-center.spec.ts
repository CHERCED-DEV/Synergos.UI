import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  NotificationCenterElementComponent,
  type NotificationReadDetail,
  normalizeNotifications,
  normalizePollingInterval,
} from './notification-center';

const ITEMS = JSON.stringify([
  { id: 'n1', title: 'Nueva reserva', body: 'Confirmada para mañana', read: false },
  { id: 'n2', title: 'Pago recibido', body: 'Tu factura está al día', read: true },
  { id: 'n3', title: 'Mensaje nuevo', body: 'Tienes un comentario', read: false },
  { id: 'n1', title: 'Duplicado — descartado', body: 'mismo id' },
  { body: '' }, // sin título ni cuerpo → descartado
]);

describe('NotificationCenterElementComponent', () => {
  let fixture: ComponentFixture<NotificationCenterElementComponent>;
  let component: NotificationCenterElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotificationCenterElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationCenterElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render no items (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasItems()).toBe(false);
    expect(component.unreadCount()).toBe(0);
    expect(component.hasUnread()).toBe(false);
    expect(component.title()).toBe('Notificaciones');
  });

  it('should render items from config and count unread, honoring overrides (render/config case)', async () => {
    fixture.componentRef.setInput('items', ITEMS);
    fixture.componentRef.setInput('title', 'Avisos');
    fixture.detectChanges();
    await fixture.whenStable();

    // 3 valid unique items survive normalization (dup id + empty dropped).
    expect(component.items().length).toBe(3);
    expect(component.title()).toBe('Avisos');
    // n1 + n3 are unread.
    expect(component.unreadCount()).toBe(2);
    expect(component.hasUnread()).toBe(true);
  });

  it('should toggle read state and emit notificationread (interaction case)', async () => {
    fixture.componentRef.setInput('items', ITEMS);
    fixture.detectChanges();
    await fixture.whenStable();

    let emitted: NotificationReadDetail | undefined;
    component.notificationread.subscribe((detail) => (emitted = detail));

    const first = component.items().find((item) => item.id === 'n1');
    expect(first).toBeDefined();
    component.toggleRead(first!);

    expect(emitted).toEqual({ id: 'n1', read: true });
    expect(component.items().find((item) => item.id === 'n1')?.read).toBe(true);
    expect(component.unreadCount()).toBe(1);

    // markAllRead clears the remaining unread and emits once.
    let allFired = 0;
    component.notificationreadall.subscribe(() => (allFired += 1));
    component.markAllRead();
    expect(component.unreadCount()).toBe(0);
    expect(allFired).toBe(1);
  });

  it('should let direct inputs override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', '{"title":"Config title","emptyLabel":"Config empty"}');
    fixture.componentRef.setInput('title', 'Input title');
    fixture.detectChanges();
    await fixture.whenStable();

    // Direct input wins over config; unset field falls back to config value.
    expect(component.title()).toBe('Input title');
    expect(component.emptyLabel()).toBe('Config empty');
  });

  it('should dismiss an item and emit notificationdismiss without re-adding it', async () => {
    fixture.componentRef.setInput('items', ITEMS);
    fixture.detectChanges();
    await fixture.whenStable();

    let dismissedId: string | undefined;
    component.notificationdismiss.subscribe((detail) => (dismissedId = detail.id));

    const target = component.items()[0];
    component.dismiss(target);
    expect(dismissedId).toBe(target.id);
    expect(component.items().some((item) => item.id === target.id)).toBe(false);

    // Dismissing again is a no-op (idempotent).
    component.dismiss(target);
    expect(component.items().length).toBe(2);
  });

  // ── loading: esqueleto CON forma + aviso audible (los DOS, siempre) ─────────
  it('reserves the list shape with a skeleton and still announces the load', () => {
    // A never-resolving fetch parks the component in `loading` with no items.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    fixture.componentRef.setInput('fetchEndpoint', '/api/notifications');
    fixture.detectChanges();

    expect(component.loading()).toBe(true);
    expect(component.hasItems()).toBe(false);

    const host = fixture.nativeElement as HTMLElement;

    // 1) The skeleton mimics the real row (dot + body lines + two actions),
    //    reusing `notif__item` so padding/gap/border are the real ones.
    const rows = host.querySelectorAll('.notif__item--skeleton');
    expect(rows.length).toBe(component.skeletonRows.length);
    expect(host.querySelectorAll('.notif__bone--action').length).toBe(rows.length * 2);

    // 2) Bones are decorative and hidden from assistive tech…
    expect(host.querySelector('.notif__list--loading')?.getAttribute('aria-hidden')).toBe('true');

    // 3) …so the announcement MUST survive on a live region. Skeleton without
    //    this pair = prettier screen, silent screen reader — a11y REGRESSION.
    const announcement = host.querySelector('.notif__sr');
    expect(announcement).not.toBeNull();
    expect(announcement!.getAttribute('role')).toBe('status');
    expect(announcement!.textContent).toContain('Cargando notificaciones');
  });
});

describe('notification-center pure helpers', () => {
  it('normalizeNotifications drops entries without title/body and dedupes by id', () => {
    const items = normalizeNotifications([
      { id: 'a', title: 'Ok' },
      { id: 'a', title: 'Dup' },
      { body: 'sólo cuerpo' },
      {},
      'no-objeto',
    ]);
    expect(items.length).toBe(2);
    expect(items[0].id).toBe('a');
    expect(items[1].body).toBe('sólo cuerpo');
  });

  it('normalizePollingInterval clamps to a sane floor and disables on zero', () => {
    expect(normalizePollingInterval(0)).toBe(0);
    expect(normalizePollingInterval(undefined)).toBe(0);
    expect(normalizePollingInterval(500)).toBe(1000);
    expect(normalizePollingInterval(30000)).toBe(30000);
  });

});
