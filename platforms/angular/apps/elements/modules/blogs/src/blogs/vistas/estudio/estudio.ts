import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  EstudioDeBlogs,
  RedDeBlogs,
  SUSCRIPCION_ENCENDIDA,
  SuscripcionDeBlogs,
  type StudioPostStat,
} from '@synergos/dominio/blogs';
import { ButtonComponent } from '@synergos/shared';
import {
  ConsoleShellComponent,
  type ConsoleColumn,
  type ConsoleKpi,
  type ConsoleRowAction,
  type ConsoleRowActionEvent,
  type ConsoleShellConfig,
} from '@synergos/shells';
import { PresentacionDeBlogs } from '../../estado/presentacion';
import { BlogsAccesoComponent } from '../../piezas/acceso/acceso';

/** El estudio de quien escribe (SH-5 `syn-console-shell`): sus cifras, su contenido y su audiencia. Sin sesión, el panel. */
@Component({
  selector: 'sg-blogs-estudio',
  standalone: true,
  imports: [NgTemplateOutlet, ButtonComponent, ConsoleShellComponent, BlogsAccesoComponent],
  templateUrl: './estudio.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'blogs__vista' },
})
export class BlogsEstudioComponent {
  protected readonly red = inject(RedDeBlogs);
  protected readonly estudio = inject(EstudioDeBlogs);
  protected readonly suscripcion = inject(SuscripcionDeBlogs);
  protected readonly presentacion = inject(PresentacionDeBlogs);

  readonly studioConfig = computed<ConsoleShellConfig>(() => {
    const studio = this.estudio.studio();
    return {
      heading: 'Creator Studio',
      navLabel: 'Secciones del estudio',
      kpisLabel: 'Indicadores del creador',
      filtersLabel: 'Filtros',
      actionsLabel: 'Acciones',
      emptyMessage: 'No hay datos en esta sección.',
      loadingMessage: 'Cargando analítica…',
      sections: [
        { id: 'overview', label: 'Resumen', kind: 'custom' },
        { id: 'content', label: 'Contenido', kind: 'table', badge: studio?.topPosts.length || undefined },
        { id: 'audience', label: 'Audiencia', kind: 'custom' },
        // La suscripción está apagada (P5 A): sin ella, la monetización no se ofrece.
        ...(SUSCRIPCION_ENCENDIDA
          ? [{ id: 'monetization', label: 'Monetización', kind: 'custom' as const, badge: studio?.tiers.length || undefined }]
          : []),
      ],
    };
  });

  readonly studioKpis = computed<readonly ConsoleKpi[]>(() => {
    const studio = this.estudio.studio();
    if (!studio) {
      return [];
    }
    const presentacion = this.presentacion;
    return [
      {
        id: 'followers',
        label: 'Seguidores',
        value: presentacion.formatCount(studio.followers),
        trend: studio.followersDelta >= 0 ? 'up' : 'down',
        delta: `${studio.followersDelta >= 0 ? '+' : ''}${presentacion.formatCount(studio.followersDelta)}`,
      },
      {
        id: 'reach',
        label: 'Alcance (30 d)',
        value: presentacion.formatCount(studio.reach),
        trend: studio.reachDelta >= 0 ? 'up' : 'down',
        delta: `${studio.reachDelta >= 0 ? '+' : ''}${presentacion.formatCount(studio.reachDelta)}`,
      },
      {
        id: 'engagement',
        label: 'Engagement',
        value: `${studio.engagementRate.toFixed(1)}%`,
        hint: 'reacciones + comentarios / alcance',
      },
      // Ingresos y suscriptores son de la suscripción, que está apagada (P5 A): un «$ 0» no es un dato, es la
      // promesa de algo que no hay.
      ...(SUSCRIPCION_ENCENDIDA
        ? [
            {
              id: 'revenue',
              label: 'Ingresos del mes',
              value: presentacion.formatMinor(studio.monthlyRevenueMinor, studio.currency),
              hint: `${this.estudio.subscriberTotal()} suscriptores`,
            },
          ]
        : []),
    ];
  });

  readonly studioColumns: readonly ConsoleColumn[] = [
    { key: 'excerpt', label: 'Publicación' },
    { key: 'impressions', label: 'Impresiones', align: 'end' },
    { key: 'engagements', label: 'Interacciones', align: 'end' },
    { key: 'reactions', label: 'Reacciones', align: 'end' },
    { key: 'comments', label: 'Comentarios', align: 'end' },
  ];

  readonly studioActions: readonly ConsoleRowAction[] = [{ id: 'open', label: 'Ver', kind: 'default' }];

  onStudioAction(event: ConsoleRowActionEvent<StudioPostStat>): void {
    this.estudio.onStudioAction(event);
  }
}
