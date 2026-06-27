import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PaxSelectorElementComponent, type PaxOccupancy } from './pax-selector';

describe('PaxSelectorElementComponent', () => {
  let fixture: ComponentFixture<PaxSelectorElementComponent>;
  let component: PaxSelectorElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaxSelectorElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(PaxSelectorElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should start with one room, one adult, no children (default case)', () => {
    expect(component).toBeTruthy();
    expect(component.totalRooms()).toBe(1);
    expect(component.totalAdults()).toBe(1);
    expect(component.totalChildren()).toBe(0);
    expect(component.summary()).toBe('1 habitación · 1 adulto · 0 niños');
  });

  it('should add a room and emit the new occupancy (add-room case)', () => {
    const emitted: PaxOccupancy[] = [];
    component.occupancychange.subscribe((value) => emitted.push(value));

    component.addRoom();

    expect(component.totalRooms()).toBe(2);
    expect(component.summary()).toBe('2 habitaciones · 2 adultos · 0 niños');
    expect(emitted.at(-1)?.rooms.length).toBe(2);
    expect(emitted.at(-1)?.rooms[1]).toEqual({ adults: 1, childAges: [] });
  });

  it('should add a child and set its age (add-child-with-age case)', () => {
    const emitted: PaxOccupancy[] = [];
    component.occupancychange.subscribe((value) => emitted.push(value));

    component.addChild(0);
    expect(component.totalChildren()).toBe(1);
    // New children default into the lowest band (infante 0-2).
    expect(component.rooms()[0].childAges).toEqual([0]);
    expect(component.ageBandLabel(0)).toBe('infante');

    const select = document.createElement('select');
    select.innerHTML = '<option value="7">7</option>';
    select.value = '7';
    component.setChildAge(0, 0, { target: select } as unknown as Event);

    expect(component.rooms()[0].childAges).toEqual([7]);
    expect(component.ageBandLabel(7)).toBe('niño');
    expect(emitted.at(-1)?.rooms[0].childAges).toEqual([7]);
  });

  it('should enforce occupancy rules: min 1 adult + max per room (rules-enforced case)', async () => {
    fixture.componentRef.setInput('maxPerRoom', 3);
    fixture.detectChanges();
    await fixture.whenStable();

    // Min 1 adult: cannot remove the only adult.
    expect(component.canRemoveAdult(component.rooms()[0])).toBe(false);
    component.removeAdult(0);
    expect(component.rooms()[0].adults).toBe(1);

    // Fill the room to its max occupancy (1 adult + 2 children = 3).
    component.addChild(0);
    component.addChild(0);
    expect(component.roomGuests(component.rooms()[0])).toBe(3);

    // At capacity: cannot add a third child nor a second adult.
    expect(component.canAddChild(component.rooms()[0])).toBe(false);
    expect(component.canAddAdult(component.rooms()[0])).toBe(false);
    component.addChild(0);
    expect(component.totalChildren()).toBe(2);
  });
});
