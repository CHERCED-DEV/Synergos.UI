import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { MiHistoria, TEXTOS_DE_SALUD } from '@synergos/dominio/salud';
import { textosDeSaludDelPortal } from '../../textos-de-salud';
import { SaludMiSaludComponent } from './mi-salud';

/** «Mi salud» desde la historia de producción (I2 T062): lo que la vista enseña en cada estado de la fachada. */
describe('La vista «Mi salud» (T062)', () => {
  let fixture: ComponentFixture<SaludMiSaludComponent>;
  let historia: MiHistoria;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SaludMiSaludComponent],
      providers: [provideZonelessChangeDetection(), { provide: TEXTOS_DE_SALUD, useFactory: textosDeSaludDelPortal }, MiHistoria],
    });
    fixture = TestBed.createComponent(SaludMiSaludComponent);
    historia = TestBed.inject(MiHistoria);
  });

  afterEach(() => TestBed.resetTestingModule());

  const texto = (): string => (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('lo declarado por el paciente se ve «por validar» y lo del médico «validado»', () => {
    historia.resumen.set({
      datos: [
        { id: 'd1', tipo: 'alergia', descripcion: 'Penicilina', fecha: null, estado: 'declarado', origen: 'paciente' },
        { id: 'd2', tipo: 'condicion', descripcion: 'Hipertensión', fecha: null, estado: 'validado', origen: 'medico' },
      ],
      preRegistro: null,
      hayResumen: true,
      permisoDeLaHistoria: 'falta',
    });
    historia.estado.set('lista');
    fixture.detectChanges();

    const filas = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('li')).map((li) =>
      li.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(filas).toEqual(['Hipertensión Validado', 'Penicilina Por validar']);
    expect(texto()).toContain('falta tu permiso');
  });

  it('una historia que no se pudo leer no dice «sin alergias», y sin historia dice quién la abre', () => {
    historia.estado.set('ilegible');
    fixture.detectChanges();
    expect(texto()).toContain('Esto no quiere decir que no tengas ninguna');

    historia.estado.set('sin-historia');
    fixture.detectChanges();
    expect(texto()).toContain('La abre el consultorio');
  });
});
