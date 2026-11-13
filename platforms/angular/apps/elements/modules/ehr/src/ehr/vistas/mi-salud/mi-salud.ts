import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { MiHistoria, TIPOS_DEL_RESUMEN, type DatoDelResumen } from '@synergos/dominio/salud';
import { BadgeComponent, ButtonComponent, SynEmptyStateComponent, SynSkeletonComponent } from '@synergos/shared';
import { textosDeLaHistoria, type TextosDeLasVistasDeLaHistoria } from '../../textos-de-salud';

/** El título de cada tipo de dato del resumen. */
export function tituloDelTipo(tipo: string, textos: TextosDeLasVistasDeLaHistoria): string {
  return tipo === 'alergia' ? textos.allergies : tipo === 'vacuna' ? textos.vaccines : textos.conditions;
}

/**
 * «Mi salud» desde la historia de producción (I2 T062): lo validado por el médico y lo que el paciente declaró, como «por
 * validar». El estado es de la fachada `MiHistoria`; la vista lo pinta y avisa la intención (hacer el pre-registro,
 * reintentar). Una historia que no se pudo leer NO es una sin alergias. Sus textos, la sección `Health.Record`.
 */
@Component({
  selector: 'sg-salud-mi-salud',
  standalone: true,
  imports: [BadgeComponent, ButtonComponent, SynEmptyStateComponent, SynSkeletonComponent],
  templateUrl: './mi-salud.html',
  styleUrl: './mi-salud.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaludMiSaludComponent {
  protected readonly historia = inject(MiHistoria);
  protected readonly tipos = TIPOS_DEL_RESUMEN;
  protected readonly textos = textosDeLaHistoria();

  readonly checkIn = output<void>();
  readonly reintentar = output<void>();

  protected datosDe(tipo: string): readonly DatoDelResumen[] {
    return (this.historia.resumen()?.datos ?? []).filter((d) => d.tipo === tipo);
  }

  protected tituloDe(tipo: string): string {
    return tituloDelTipo(tipo, this.textos);
  }
}
