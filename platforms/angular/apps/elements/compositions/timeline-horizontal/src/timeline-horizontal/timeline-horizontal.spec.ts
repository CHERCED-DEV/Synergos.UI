import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TIMELINE_HORIZONTAL_SYNHOST } from '@synergos/contracts';
import { TimelineHorizontalElementComponent } from './timeline-horizontal';

/**
 * El CMS manda el record `TimelineHorizontalProps` en `config`: `items` es una LISTA. El elemento no
 * tenía `config` y su `items` sólo leía texto por `parseValue`, así que `/eventos/` pintaba la
 * agenda VACÍA con 6 ítems medidos en el atributo.
 */
describe('TimelineHorizontalElementComponent', () => {
  let fixture: ComponentFixture<TimelineHorizontalElementComponent>;
  let component: TimelineHorizontalElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TimelineHorizontalElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(TimelineHorizontalElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const titulos = (): string[] =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('article')).map(
      (item) => item.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );

  it('la lista del record pinta sus ítems, con el config exacto que emite la vista', () => {
    const { ejemplo } = TIMELINE_HORIZONTAL_SYNHOST;
    fixture.componentRef.setInput('config', JSON.stringify(ejemplo));
    fixture.detectChanges();

    expect(component.items().map((item) => item.title)).toEqual(ejemplo.items?.map((item) => item.title));
    expect(component.items()[0].track).toBe('Sala A');
    expect(titulos()).toHaveLength(2);
    expect(titulos()[0]).toContain('Apertura');
  });

  it('`items` como LISTA se lee tal cual, y `eventsJson` en texto sigue funcionando', () => {
    fixture.componentRef.setInput('items', [{ time: '11:00', title: 'Taller' }]);
    fixture.detectChanges();
    expect(component.items().map((item) => item.title)).toEqual(['Taller']);

    const legado = TestBed.createComponent(TimelineHorizontalElementComponent);
    legado.componentRef.setInput('eventsJson', JSON.stringify([{ time: '08:00', title: 'Registro', track: 'Lobby' }]));
    legado.detectChanges();
    expect(legado.componentInstance.items().map((item) => `${item.time} ${item.title} ${item.track}`)).toEqual([
      '08:00 Registro Lobby',
    ]);
  });

  it('una lista vacía no pinta nada', () => {
    fixture.componentRef.setInput('config', JSON.stringify({ items: [], snapEnabled: true }));
    fixture.detectChanges();

    expect(component.hasItems()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('.timeline-horizontal')).toBeNull();
  });
});
