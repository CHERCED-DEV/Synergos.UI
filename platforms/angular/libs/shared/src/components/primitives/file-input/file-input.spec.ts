import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FileInputComponent } from './file-input';

describe('syn-file-input', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('pinta su etiqueta unida al campo, ofrece lo que acepta y avisa el fichero elegido', () => {
    TestBed.configureTestingModule({ imports: [FileInputComponent], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(FileInputComponent);
    fixture.componentRef.setInput('label', 'Informe (PDF)');
    fixture.componentRef.setInput('accept', 'application/pdf');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const campo = host.querySelector('input') as HTMLInputElement;
    let elegido: File | null | undefined;
    fixture.componentInstance.fileChange.subscribe((f) => (elegido = f));

    const fichero = new File(['%PDF'], 'informe.pdf', { type: 'application/pdf' });
    Object.defineProperty(campo, 'files', { value: [fichero] });
    campo.dispatchEvent(new Event('change'));

    expect(host.querySelector('label')?.getAttribute('for')).toBe(campo.id);
    expect(campo.getAttribute('accept')).toBe('application/pdf');
    expect(elegido).toBe(fichero);
  });
});
