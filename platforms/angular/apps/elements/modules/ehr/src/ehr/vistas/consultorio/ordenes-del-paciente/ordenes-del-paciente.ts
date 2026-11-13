import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import {
  ConsultaDelDia,
  MARCAS_DEL_RESULTADO,
  OrdenesDelPaciente,
  TIPOS_DE_ORDEN,
  urlDelInforme,
  type MarcaDelResultado,
  type OrdenEscrita,
  type ResultadoCargado,
  type TipoDeOrden,
} from '@synergos/dominio/salud';
import {
  BadgeComponent,
  ButtonComponent,
  FileInputComponent,
  InputComponent,
  LiveRegionComponent,
  SelectComponent,
  SynSkeletonComponent,
  TextareaComponent,
} from '@synergos/shared';
import { textosDeLaHistoria, type TextosDeLasVistasDeLaHistoria } from '../../../textos-de-salud';

/** Cómo se llama un tipo de orden. */
export function nombreDelTipo(tipo: string, t: TextosDeLasVistasDeLaHistoria): string {
  return tipo === 'imagenes' ? t.typeImaging : tipo === 'remision' ? t.typeReferral : t.typeLab;
}

/** Cómo se llama la marca de un resultado. */
export function nombreDeLaMarca(marca: string, t: TextosDeLasVistasDeLaHistoria): string {
  return marca === 'alto' ? t.flagHigh : marca === 'bajo' ? t.flagLow : marca === 'critico' ? t.flagCritical : t.flagNormal;
}

/** El contenido de un fichero en base64, para el cuerpo JSON. */
export async function base64De(fichero: File): Promise<string> {
  const bytes = new Uint8Array(await fichero.arrayBuffer());
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binario);
}

/**
 * Las órdenes del paciente que se atiende (003-salud-cita, I4 P11 y P12): el médico ordena exámenes; el consultorio carga
 * el resultado con el PDF del informe; el médico lo libera al paciente. Pinta `OrdenesDelPaciente` y avisa la intención.
 */
@Component({
  selector: 'sg-salud-ordenes-del-paciente',
  standalone: true,
  imports: [
    BadgeComponent, ButtonComponent, FileInputComponent, InputComponent, LiveRegionComponent, SelectComponent,
    SynSkeletonComponent, TextareaComponent,
  ],
  templateUrl: './ordenes-del-paciente.html',
  styleUrl: '../consultorio.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaludOrdenesDelPacienteComponent {
  protected readonly consulta = inject(ConsultaDelDia);
  protected readonly ordenes = inject(OrdenesDelPaciente);
  protected readonly textos = textosDeLaHistoria();

  /** La base de la historia, para el enlace del informe. */
  readonly base = input('');

  readonly ordenar = output<OrdenEscrita>();
  readonly cargar = output<{ readonly ordenId: string; readonly resultado: ResultadoCargado }>();
  readonly liberar = output<string>();

  protected readonly tipos = TIPOS_DE_ORDEN.map((t) => ({ value: t, label: nombreDelTipo(t, this.textos) }));
  protected readonly marcas = MARCAS_DEL_RESULTADO.map((m) => ({ value: m, label: nombreDeLaMarca(m, this.textos) }));

  protected readonly tipo = signal<TipoDeOrden>('laboratorio');
  protected readonly examenes = signal('');
  protected readonly indicacion = signal('');

  /** El examen al que se le carga el resultado. */
  protected readonly cargando = signal<{ readonly ordenId: string; readonly examenId: string } | null>(null);
  protected readonly valor = signal('');
  protected readonly unidad = signal('');
  protected readonly rango = signal('');
  protected readonly marca = signal<MarcaDelResultado>('normal');
  protected readonly nota = signal('');
  protected readonly archivo = signal<File | null>(null);

  protected nombreDelTipo(tipo: string): string {
    return nombreDelTipo(tipo, this.textos);
  }

  protected nombreDeLaMarca(marca: string): string {
    return nombreDeLaMarca(marca, this.textos);
  }

  protected informe(resultadoId: string, patientKey: string): string {
    return urlDelInforme(this.base(), resultadoId, patientKey);
  }

  protected ordenarLaOrden(): void {
    this.ordenar.emit({
      tipo: this.tipo(),
      examenes: this.examenes().split('\n').map((e) => e.trim()).filter(Boolean),
      indicacion: this.indicacion().trim() || undefined,
    });
  }

  protected elegir(ordenId: string, examenId: string): void {
    const actual = this.cargando();
    this.cargando.set(actual?.ordenId === ordenId && actual.examenId === examenId ? null : { ordenId, examenId });
    this.valor.set('');
    this.unidad.set('');
    this.rango.set('');
    this.marca.set('normal');
    this.nota.set('');
    this.archivo.set(null);
  }

  protected async cargarElResultado(): Promise<void> {
    const destino = this.cargando();
    if (!destino) {
      return;
    }
    const fichero = this.archivo();
    this.cargar.emit({
      ordenId: destino.ordenId,
      resultado: {
        examenId: destino.examenId,
        valor: this.valor().trim(),
        unidad: this.unidad().trim() || undefined,
        rango: this.rango().trim() || undefined,
        marca: this.marca(),
        nota: this.nota().trim() || undefined,
        informe: fichero ? { nombre: fichero.name, tipo: fichero.type, contenidoBase64: await base64De(fichero) } : undefined,
      },
    });
    this.cargando.set(null);
  }
}
