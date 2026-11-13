import { ChangeDetectionStrategy, Component, effect, inject, output, signal, untracked } from '@angular/core';
import { MiHistoria, type CheckInDelPaciente } from '@synergos/dominio/salud';
import { ButtonComponent, InputComponent, LiveRegionComponent, TextareaComponent } from '@synergos/shared';
import { textosDeLaHistoria } from '../../textos-de-salud';
import { SaludPermisoComponent } from '../permiso/permiso';

/** Lo más largo que guarda el CMS por texto (`HistoriaClinica.LargoMaximo`). */
const LARGO = 200;

/** Una lista escrita un dato por línea. */
export function lineas(texto: string): readonly string[] {
  return texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * El check-in del paciente desde la historia de producción (I2 T062): demografía, aseguradora, medicamentos, el motivo y lo
 * que declara de su salud. Todo entra como DECLARADO; el médico lo valida. Si falta el permiso para que el consultorio vea
 * la historia, se pide aquí con el mismo texto de la cita (D-003-I2-2). La vista arma lo que se manda y avisa la intención;
 * la app lo envía con la fachada `MiHistoria`.
 */
@Component({
  selector: 'sg-salud-check-in',
  standalone: true,
  imports: [ButtonComponent, InputComponent, LiveRegionComponent, TextareaComponent, SaludPermisoComponent],
  templateUrl: './check-in.html',
  styleUrl: './check-in.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaludCheckInComponent {
  protected readonly historia = inject(MiHistoria);
  protected readonly largo = LARGO;
  protected readonly textos = textosDeLaHistoria();

  readonly enviar = output<CheckInDelPaciente>();
  readonly aceptarPermiso = output<void>();

  protected readonly documento = signal('');
  protected readonly telefono = signal('');
  protected readonly direccion = signal('');
  protected readonly contactoDeEmergencia = signal('');
  protected readonly aseguradora = signal('');
  protected readonly numeroDeAfiliacion = signal('');
  protected readonly motivoDeLaVisita = signal('');
  protected readonly medicamentos = signal('');
  protected readonly condiciones = signal('');
  protected readonly alergias = signal('');

  constructor() {
    // Lo que ya declaró vuelve al formulario: actualizarlo no es empezar de cero.
    effect(() => {
      const pre = this.historia.resumen()?.preRegistro;
      if (!pre) {
        return;
      }
      untracked(() => {
        this.documento.set(pre.documento);
        this.telefono.set(pre.telefono);
        this.direccion.set(pre.direccion);
        this.contactoDeEmergencia.set(pre.contactoDeEmergencia);
        this.aseguradora.set(pre.aseguradora);
        this.numeroDeAfiliacion.set(pre.numeroDeAfiliacion);
        this.motivoDeLaVisita.set(pre.motivoDeLaVisita);
        this.medicamentos.set(pre.medicamentos.join('\n'));
      });
    });
  }

  protected enviarElCheckIn(): void {
    this.enviar.emit({
      documento: this.documento().trim(),
      telefono: this.telefono().trim(),
      direccion: this.direccion().trim(),
      contactoDeEmergencia: this.contactoDeEmergencia().trim(),
      aseguradora: this.aseguradora().trim(),
      numeroDeAfiliacion: this.numeroDeAfiliacion().trim(),
      motivoDeLaVisita: this.motivoDeLaVisita().trim(),
      medicamentos: lineas(this.medicamentos()),
      condiciones: lineas(this.condiciones()),
      alergias: lineas(this.alergias()),
    });
  }
}
