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
      { label: 'Tokens', value: '200+' },
      { label: 'Componentes', value: '60+' },
      { label: 'Frameworks', value: '4' },
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
      'Angular Elements (principal)',
      'React, Svelte, Vanilla POCs',
      'Zero-dependency en cliente',
      'Shadow DOM encapsulado',
    ],
    metrics: [
      { label: 'Elements', value: '55+' },
      { label: 'Tiers', value: '3' },
      { label: 'Bundle avg', value: '< 80kb' },
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
      'El mismo elemento puede vivir en Angular, React, Svelte o Vanilla JS. El protocolo bridge garantiza que todos produzcan el mismo Custom Element con el mismo contrato.',
    features: [
      'Bridge protocol cross-framework',
      'Mismo tag, mismo contrato, cualquier framework',
      'POCs validados en React 19, Svelte 5 y Vanilla',
      'Escalable a Vue, Lit o WebAssembly',
    ],
    metrics: [
      { label: 'Frameworks', value: '4' },
      { label: 'Shared contracts', value: '100%' },
      { label: 'API surface', value: 'idéntica' },
    ],
    ctaLabel: 'Ver arquitectura',
    ctaUrl: '/architecture',
  },
];
