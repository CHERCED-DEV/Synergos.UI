import type { InsightItem } from './models/insight-item.model';

export const DEFAULT_INSIGHTS: readonly InsightItem[] = [
  {
    id: 'design-system',
    icon: '🎨',
    title: 'Design System',
    description:
      'Un sistema de diseño completo con tokens de color, tipografía y espaciado. Cada decisión visual se formaliza en código, garantizando consistencia en todos los canales digitales.',
    features: [
      'Tokens SCSS: color, espaciado, tipografía, sombras',
      'Componentes atómicos reutilizables',
      'Guías de estilo generadas automáticamente',
      'Sincronización con Figma',
    ],
    metrics: [
      { label: 'Tokens', value: '322' },
      { label: 'Componentes', value: '50' },
      { label: 'Temas', value: '7' },
    ],
    ctaLabel: 'Ver catálogo',
    ctaUrl: '/catalog',
  },
  {
    id: 'web-components',
    icon: '🧩',
    title: 'Web Components',
    description:
      'Elementos UI construidos como Custom Elements estándar. Funcionan en cualquier framework o sitio HTML plano, sin dependencias externas en el cliente.',
    features: [
      'Angular Elements — la plataforma que los construye',
      'Se empalman en cualquier host, sin adaptador',
      'Zero-dependency en cliente',
      'Shadow DOM encapsulado',
    ],
    metrics: [
      { label: 'Elements', value: '139' },
      { label: 'Tiers', value: '3' },
      { label: 'Bundle avg', value: '< 40kb' },
    ],
    ctaLabel: 'Explorar elements',
    ctaUrl: '/elements',
  },
  {
    id: 'cms-integration',
    icon: '🔗',
    title: 'Integración CMS',
    description:
      'Contrato tipado entre Umbraco y los elements. Los editores configuran bloques de contenido desde una interfaz visual y el sistema genera los atributos HTML correctos.',
    features: [
      'Contratos TypeScript generados desde C#',
      'Mappers automáticos por tipo de elemento',
      'Validación de datos en build time',
      'API REST documentada',
    ],
    metrics: [
      { label: 'Contratos', value: '55+' },
      { label: 'Mappers', value: '55+' },
      { label: 'Latencia API', value: '< 50ms' },
    ],
    ctaLabel: 'Ver integración',
    ctaUrl: '/integration',
  },
  {
    id: 'cdn-deploy',
    icon: '🚀',
    title: 'Deploy al CDN',
    description:
      'Cada elemento se empaqueta y publica de forma independiente en CDN. Las páginas cargan solo lo que necesitan, con caché agresivo y control granular de versiones.',
    features: [
      'Bundles independientes por elemento',
      'Tree-shaking y code splitting automático',
      'Caché de larga duración con hash de contenido',
      'Rollback instantáneo por versión',
    ],
    metrics: [
      { label: 'Time to CDN', value: '< 3 min' },
      { label: 'Cache hit', value: '99%' },
      { label: 'LCP objetivo', value: '< 2.5s' },
    ],
    ctaLabel: 'Ver pipeline',
    ctaUrl: '/pipeline',
  },
  {
    id: 'multi-framework',
    icon: '⚡',
    title: 'Multi-Framework',
    description:
      'Angular es donde se construye: ahí viven el design system y todo el catálogo, y ahí se concentra el trabajo. Lo que se publica son Custom Elements estándar, así que se empalman en la casa del cliente tal como esté hecha —React, Vue, Svelte, WordPress o HTML plano— sin adaptador y sin pedirle que migre.',
    features: [
      'Angular first: una sola plataforma que construir y mantener',
      'Se publican Custom Elements estándar, no componentes de framework',
      'Empalme sin adaptador: el navegador ya sabe qué son',
      'Mismo tag, mismo contrato, cualquier host',
    ],
    metrics: [
      { label: 'Se construye en', value: 'Angular' },
      { label: 'Se consume en', value: 'cualquiera' },
      { label: 'Adaptadores', value: '0' },
    ],
    ctaLabel: 'Ver arquitectura',
    ctaUrl: '/architecture',
  },
];
