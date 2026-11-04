import { ChangeDetectionStrategy, Component } from '@angular/core';

/** La insignia de cuenta verificada (badge-check, `currentColor`: sigue el tema). La etiqueta la pone quien la usa. */
@Component({
  selector: 'sg-blogs-verificada',
  standalone: true,
  template: `<svg class="blogs__ic blogs__ic--xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/></svg>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'blogs__pieza' },
})
export class BlogsVerificadaComponent {}
