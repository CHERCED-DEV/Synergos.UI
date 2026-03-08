import { TestBed } from '@angular/core/testing';
import { ModalComponent } from './modal';

describe(ModalComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModalComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(ModalComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('opens and closes the dialog', () => {
    const fixture = TestBed.createComponent(ModalComponent);
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('.syn-modal__trigger') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeTruthy();

    const close = fixture.nativeElement.querySelector('.syn-modal__close') as HTMLButtonElement;
    close.click();
    fixture.detectChanges();

    expect(closed).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });
});