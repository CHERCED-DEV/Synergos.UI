import { TestBed } from '@angular/core/testing';
import { StatusTagComponent } from './status-tag';

describe(StatusTagComponent.name, () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatusTagComponent],
    }).compileComponents();
  });

  it('creates the component', () => {
    const fixture = TestBed.createComponent(StatusTagComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the provided status label', () => {
    const fixture = TestBed.createComponent(StatusTagComponent);
    fixture.componentRef.setInput('label', 'Confirmed');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Confirmed');
  });

  it('applies tone and style classes', () => {
    const fixture = TestBed.createComponent(StatusTagComponent);
    fixture.componentRef.setInput('tone', 'pending');
    fixture.componentRef.setInput('style', 'filled');
    fixture.detectChanges();

    const tag = fixture.nativeElement.querySelector('.syn-status-tag') as HTMLElement;
    expect(tag.className).toContain('syn-status-tag--pending');
    expect(tag.className).toContain('syn-status-tag--filled');
  });

  // 014-despiece-tienda: el estado de una fila no es un anuncio; la región viva va sólo cuando se pide.
  it('is not a live region unless asked', () => {
    const fixture = TestBed.createComponent(StatusTagComponent);
    fixture.componentRef.setInput('label', 'En camino');
    fixture.detectChanges();
    const tag = fixture.nativeElement.querySelector('.syn-status-tag') as HTMLElement;
    expect(tag.hasAttribute('role')).toBe(false);

    fixture.componentRef.setInput('live', true);
    fixture.detectChanges();
    expect(tag.getAttribute('role')).toBe('status');
  });
});
