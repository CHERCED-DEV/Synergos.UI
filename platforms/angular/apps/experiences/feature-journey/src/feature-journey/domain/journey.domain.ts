import type { JourneyStep } from './models/journey-step.model';

export const JOURNEY_STEPS: readonly JourneyStep[] = [
  {
    id: 'define',
    icon: '✏️',
    title: 'Definición del Design System',
    description:
      'El equipo define la arquitectura visual: tokens, paletas, tipografía y principios de espaciado que serán la base de todos los elementos del sistema.',
  },
  {
    id: 'tokens',
    icon: '🎨',
    title: 'Diseño de Tokens',
    description:
      'Los tokens de diseño se formalizan en código SCSS. Color, espaciado, tipografía y sombras se vuelven variables reutilizables en todo el sistema, garantizando consistencia visual.',
  },
  {
    id: 'elements',
    icon: '🧩',
    title: 'Construcción de Elements',
    description:
      'Cada bloque visual se construye como un Web Component independiente — primitivos, composiciones y módulos — listos para ser embebidos en cualquier página del sitio.',
  },
  {
    id: 'cms',
    icon: '🔗',
    title: 'Integración con CMS',
    description:
      'Umbraco conecta los elements con el contenido editorial. Los editores configuran bloques desde la interfaz y el sistema genera los atributos HTML correctos automáticamente.',
  },
  {
    id: 'cdn',
    icon: '🚀',
    title: 'Deploy al CDN',
    description:
      'Los bundles optimizados se publican en CDN. Cada página carga solo los elements que necesita, garantizando velocidad máxima y escalabilidad en producción.',
  },
];
