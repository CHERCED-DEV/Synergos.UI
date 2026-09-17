import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ConfirmationShellComponent,
  type ConfirmationAction,
  type ConfirmationFact,
  type ConfirmationShellConfig,
  type ConfirmationStep,
} from './confirmation-shell';

const CONFIG: ConfirmationShellConfig = {
  heading: 'Tu solicitud quedó radicada',
  summary: 'Te avisaremos por correo cuando haya una decisión.',
  referenceLabel: 'Radicado',
  stepsLabel: 'Qué sigue',
};

@Component({
  standalone: true,
  imports: [ConfirmationShellComponent],
  template: `
    <ng-template #artifact>
      <p class="artifact-body">QR de la entrada</p>
    </ng-template>
    <syn-confirmation-shell
      [config]="config()"
      [reference]="reference()"
      [facts]="facts()"
      [steps]="steps()"
      [actions]="actions()"
      [artifactTemplate]="withArtifact() ? artifact : null"
      (referencecopied)="copiedLog.push($event)"
      (action)="actionLog.push($event)"
    />
  `,
})
class Host {
  readonly config = signal<ConfirmationShellConfig>(CONFIG);
  readonly reference = signal('RAD-2026-000481');
  readonly facts = signal<readonly ConfirmationFact[]>([]);
  readonly steps = signal<readonly ConfirmationStep[]>([]);
  readonly actions = signal<readonly ConfirmationAction[]>([]);
  readonly withArtifact = signal(false);
  readonly copiedLog: string[] = [];
  readonly actionLog: string[] = [];
}

function mount(): { fixture: ReturnType<typeof TestBed.createComponent<Host>>; host: Host } {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

const text = (fixture: { nativeElement: HTMLElement }, sel: string): string =>
  (fixture.nativeElement.querySelector(sel)?.textContent ?? '').trim();

describe('SH-11 syn-confirmation-shell', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  // ─── feliz ──────────────────────────────────────────────────────────────────
  it('muestra el acuse y la referencia con el rótulo del dominio', () => {
    const { fixture } = mount();

    expect(text(fixture, '.syn-confirm__heading')).toBe('Tu solicitud quedó radicada');
    expect(text(fixture, '.syn-confirm__ref-label')).toBe('Radicado');
    expect(text(fixture, '.syn-confirm__ref-value')).toBe('RAD-2026-000481');
    expect(fixture.nativeElement.querySelector('.syn-confirm__missing')).toBeNull();
  });

  // ─── vacío: el caso que vuelve la pantalla inútil SIN romperse ───────────────
  it('sin referencia lo dice a la vista en vez de dejar un hueco elegante', () => {
    const { fixture, host } = mount();
    host.reference.set('');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.syn-confirm__ref')).toBeNull();
    const aviso = fixture.nativeElement.querySelector('.syn-confirm__missing');
    expect(aviso).not.toBeNull();
    expect(aviso?.getAttribute('role')).toBe('alert');
  });

  it('una referencia de sólo espacios cuenta como ausente', () => {
    const { fixture, host } = mount();
    host.reference.set('   ');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.syn-confirm__missing')).not.toBeNull();
  });

  // ─── el acuse se anuncia, pero no interrumpe ────────────────────────────────
  it('el acuse es role="status" y no "alert" — es el desenlace esperado', () => {
    const { fixture } = mount();

    expect(
      fixture.nativeElement.querySelector('.syn-confirm__ack')?.getAttribute('role'),
    ).toBe('status');
  });

  // ─── pasos y datos ──────────────────────────────────────────────────────────
  it('lista los pasos en orden y marca el que ya ocurrió', () => {
    const { fixture, host } = mount();
    host.steps.set([
      { id: 'radicada', label: 'Radicada', done: true },
      { id: 'revision', label: 'En revisión', detail: 'Hasta 15 días hábiles' },
    ]);
    fixture.detectChanges();

    const pasos = [...fixture.nativeElement.querySelectorAll('.syn-confirm__step')];
    expect(pasos).toHaveLength(2);
    expect(pasos[0].classList.contains('is-done')).toBe(true);
    expect(pasos[1].classList.contains('is-done')).toBe(false);
    expect(pasos[1].textContent).toContain('Hasta 15 días hábiles');
  });

  it('sin pasos ni datos no pinta sus contenedores', () => {
    const { fixture } = mount();

    expect(fixture.nativeElement.querySelector('.syn-confirm__steps')).toBeNull();
    expect(fixture.nativeElement.querySelector('.syn-confirm__facts')).toBeNull();
  });

  it('los datos del acuse salen ya formateados por el dominio', () => {
    const { fixture, host } = mount();
    host.facts.set([{ id: 'fecha', label: 'Fecha', value: '11 de septiembre de 2026' }]);
    fixture.detectChanges();

    expect(text(fixture, '.syn-confirm__fact-value')).toBe('11 de septiembre de 2026');
  });

  // ─── el artefacto es del dominio ────────────────────────────────────────────
  it('hace sitio al artefacto del dominio sin saber qué es', () => {
    const { fixture, host } = mount();
    expect(fixture.nativeElement.querySelector('.artifact-body')).toBeNull();

    host.withArtifact.set(true);
    fixture.detectChanges();

    expect(text(fixture, '.artifact-body')).toBe('QR de la entrada');
  });

  // ─── acciones ───────────────────────────────────────────────────────────────
  it('una acción con href navega y una sin href emite', () => {
    const { fixture, host } = mount();
    host.actions.set([
      { id: 'ver', label: 'Ver mi solicitud', href: '/carpeta' },
      { id: 'otra', label: 'Radicar otra', kind: 'primary' },
    ]);
    fixture.detectChanges();

    const enlace = fixture.nativeElement.querySelector('a.syn-confirm__action');
    expect(enlace?.getAttribute('href')).toBe('/carpeta');

    const boton = fixture.nativeElement.querySelector('button.syn-confirm__action');
    expect(boton?.classList.contains('is-primary')).toBe(true);
    boton?.click();
    fixture.detectChanges();

    expect(host.actionLog).toEqual(['otra']);
  });

  // ─── copiar: conveniencia que no puede romper nada ───────────────────────────
  it('copiar avisa al dominio y cambia el rótulo', () => {
    const { fixture, host } = mount();
    const boton = fixture.nativeElement.querySelector('.syn-confirm__copy') as HTMLButtonElement;

    boton.click();
    fixture.detectChanges();

    expect(host.copiedLog).toEqual(['RAD-2026-000481']);
    expect(text(fixture, '.syn-confirm__copy')).toBe('Copiado');
  });

  it('sin portapapeles el botón no revienta y la referencia sigue en pantalla', () => {
    const original = globalThis.navigator?.clipboard;
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });

    const { fixture, host } = mount();
    const boton = fixture.nativeElement.querySelector('.syn-confirm__copy') as HTMLButtonElement;

    expect(() => boton.click()).not.toThrow();
    fixture.detectChanges();

    // Avisa igual al dominio: el hecho de que la persona quiso copiar es real
    // aunque el navegador no deje, y la referencia se sigue pudiendo seleccionar.
    expect(host.copiedLog).toEqual(['RAD-2026-000481']);
    expect(text(fixture, '.syn-confirm__ref-value')).toBe('RAD-2026-000481');

    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: original,
      configurable: true,
    });
  });

  // ─── idempotente ────────────────────────────────────────────────────────────
  it('copiar dos veces no cambia el estado ni duplica el rótulo', () => {
    const { fixture, host } = mount();
    const boton = fixture.nativeElement.querySelector('.syn-confirm__copy') as HTMLButtonElement;

    boton.click();
    fixture.detectChanges();
    boton.click();
    fixture.detectChanges();

    expect(host.copiedLog).toEqual(['RAD-2026-000481', 'RAD-2026-000481']);
    expect(text(fixture, '.syn-confirm__copy')).toBe('Copiado');
  });

  it('sin referencia no hay botón de copiar que pulsar', () => {
    const { fixture, host } = mount();
    host.reference.set('');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.syn-confirm__copy')).toBeNull();
    expect(host.copiedLog).toEqual([]);
  });

  // ─── aviso de flujo a medias ────────────────────────────────────────────────
  it('el aviso de «se hizo pero algo quedó pendiente» se muestra aparte del error', () => {
    const { fixture, host } = mount();
    host.config.set({ ...CONFIG, warning: 'No pudimos enviarte el correo de confirmación.' });
    fixture.detectChanges();

    expect(text(fixture, '.syn-confirm__warning')).toContain('No pudimos enviarte');
    // El acto principal SÍ ocurrió: la referencia sigue ahí.
    expect(text(fixture, '.syn-confirm__ref-value')).toBe('RAD-2026-000481');
  });

  // ─── dos en la misma página ─────────────────────────────────────────────────
  it('dos confirmaciones no comparten el id del título', () => {
    const uno = TestBed.createComponent(Host);
    uno.detectChanges();
    const dos = TestBed.createComponent(Host);
    dos.detectChanges();

    const idUno = uno.nativeElement.querySelector('.syn-confirm__heading')?.getAttribute('id');
    const idDos = dos.nativeElement.querySelector('.syn-confirm__heading')?.getAttribute('id');

    expect(idUno).toBeTruthy();
    expect(idUno).not.toBe(idDos);
  });
});
