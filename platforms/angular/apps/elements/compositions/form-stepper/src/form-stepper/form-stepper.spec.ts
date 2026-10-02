import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FORM_STEPPER_SYNHOST } from '@synergos/contracts';
import { LiveAnnouncerService } from '@synergos/shared';
import { asentar as vueltas } from '../../../../../../tools/asentar';
import { FormStepperElementComponent, sanitizeFormStepperConfig } from './form-stepper';

/**
 * El formulario por pasos sobre el modelo de Forms (CMS#196, tanda D). Antes no pintaba nada (los
 * pasos venían en `config` y no tenía ese input) y, de haber pintado, decía «enviada» sin enviar.
 */

/** Lo que manda el CMS: dos pasos del modelo de Forms, la clave y lo del despliegue. */
const NEGOCIO_DEL_CMS = {
  formKey: 'reserva-cita',
  apiBase: FORM_STEPPER_SYNHOST.ejemplo.apiBase,
  honeypotField: 'syn_hp',
  steps: [
    {
      title: 'Tu reserva',
      fields: [
        { name: 'servicio', label: 'Servicio', type: 'select', required: true, options: ['Asesoría', 'Auditorio'] },
      ],
    },
    {
      title: 'Tus datos',
      description: 'Para confirmarte la cita.',
      fields: [
        { name: 'email', label: 'Email', type: 'email', required: true, helpText: 'Nunca lo compartimos.' },
        { name: 'nota', label: 'Nota', type: 'textarea', required: false },
      ],
    },
  ],
};

/** Deja correr el envío y la detección de cambios, con la espera compartida de los specs (#84). */
async function asentar(fixture: ComponentFixture<unknown>): Promise<void> {
  await vueltas(4);
  fixture.detectChanges();
  await fixture.whenStable();
}

describe('FormStepperElementComponent', () => {
  let fixture: ComponentFixture<FormStepperElementComponent>;
  let component: FormStepperElementComponent;
  let el: HTMLElement;

  async function montar(config: object = NEGOCIO_DEL_CMS): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [FormStepperElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(FormStepperElementComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('config', config);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const elegir = (name: string, valor: string): void => {
    const control = el.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!;
    control.value = valor;
    control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input'));
  };

  const boton = (texto: string): HTMLButtonElement =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.trim() === texto)!;

  async function hastaElUltimoPaso(): Promise<void> {
    elegir('servicio', 'Auditorio');
    boton('Siguiente').click();
    await asentar(fixture);
    elegir('email', 'ana@correo.co');
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('pinta los pasos que manda el CMS en config, con su select y su ayuda (el defecto: no pintaba nada)', async () => {
    await montar();

    expect(component.stepCount()).toBe(2);
    expect(el.querySelector('.form-stepper__step-title')?.textContent).toContain('Tu reserva');
    const opciones = Array.from(el.querySelectorAll('select[name="servicio"] option')).map((o) => o.textContent?.trim());
    expect(opciones).toEqual(['Selecciona una opción', 'Asesoría', 'Auditorio']);

    elegir('servicio', 'Asesoría');
    boton('Siguiente').click();
    await asentar(fixture);
    expect(el.querySelector('.form-stepper__help')?.textContent).toContain('Nunca lo compartimos.');
  });

  it('no avanza con un obligatorio vacío', async () => {
    await montar();

    boton('Siguiente').click();
    await asentar(fixture);

    expect(component.currentIndex()).toBe(0);
    expect(el.querySelector('.form-stepper__error')?.textContent).toContain('Este campo es obligatorio.');
  });

  it('envía a la API del sitio con la clave, los valores y la trampa vacía, y SÓLO entonces dice gracias', async () => {
    let resolver!: (r: Response) => void;
    const red = vi.fn(() => new Promise<Response>((r) => (resolver = r)));
    vi.stubGlobal('fetch', red);
    await montar();
    const completos: unknown[] = [];
    el.addEventListener('synergos:form-stepper:complete', (e) => completos.push((e as CustomEvent).detail));

    await hastaElUltimoPaso();
    boton('Enviar').click();
    await asentar(fixture);

    // Mientras el servidor no contesta, no hay «gracias» ni evento.
    expect(component.sending()).toBe(true);
    expect(el.querySelector('.form-stepper__done')).toBeNull();
    expect(completos).toEqual([]);

    const [url, init] = red.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${FORM_STEPPER_SYNHOST.ejemplo.apiBase}/reserva-cita/submit`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Accept']).toBe('application/json');
    expect(Object.fromEntries(new URLSearchParams(init.body as string))).toEqual({
      servicio: 'Auditorio',
      email: 'ana@correo.co',
      syn_hp: '',
    });

    resolver(new Response(JSON.stringify({ submitted: true }), { status: 200 }));
    await asentar(fixture);

    expect(el.querySelector('.form-stepper__done')?.textContent).toContain('¡Gracias!');
    expect(completos).toEqual([{ formKey: 'reserva-cita', values: { servicio: 'Auditorio', email: 'ana@correo.co' } }]);
  });

  it('si el servidor no lo acepta, lo dice y no dice gracias', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{"error":"missing-required"}', { status: 422 }))));
    await montar();
    const anuncia = vi.spyOn(TestBed.inject(LiveAnnouncerService), 'announce');

    await hastaElUltimoPaso();
    boton('Enviar').click();
    await asentar(fixture);

    expect(el.querySelector('.form-stepper__done')).toBeNull();
    expect(el.querySelector('.form-stepper__send-error')?.textContent).toContain('Ocurrió un error');
    expect(anuncia).toHaveBeenCalledWith(expect.stringContaining('Ocurrió un error'), 'assertive');
    expect(component.currentIndex()).toBe(1);
  });

  it('si la red cae, lo dice como error de conexión', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await montar();

    await hastaElUltimoPaso();
    boton('Enviar').click();
    await asentar(fixture);

    expect(el.querySelector('.form-stepper__done')).toBeNull();
    expect(el.querySelector('.form-stepper__send-error')?.textContent).toContain('Error de conexión');
  });

  it('sin la base de la API no llama a nada y dice que no se pudo (ADR 0137)', async () => {
    const red = vi.fn(() => Promise.reject(new Error('no debería llamarse')));
    vi.stubGlobal('fetch', red);
    await montar({ ...NEGOCIO_DEL_CMS, apiBase: undefined });

    await hastaElUltimoPaso();
    boton('Enviar').click();
    await asentar(fixture);

    expect(red).not.toHaveBeenCalled();
    expect(el.querySelector('.form-stepper__done')).toBeNull();
    expect(el.querySelector('.form-stepper__send-error')).not.toBeNull();
  });

  it('el sanitizador descarta un campo sin nombre y un paso sin campos, y pinta un select sin opciones como texto', () => {
    const limpio = sanitizeFormStepperConfig({
      steps: [
        { title: 'Uno', fields: [{ name: '', label: 'Sin nombre', type: 'text', required: false }, { name: 'a', label: 'A', type: 'SELECT', required: true }] },
        { title: 'Vacío', fields: [] },
      ],
    });

    expect(limpio.steps).toEqual([{ title: 'Uno', fields: [{ name: 'a', label: 'A', type: 'select', required: true }] }]);
  });
});
