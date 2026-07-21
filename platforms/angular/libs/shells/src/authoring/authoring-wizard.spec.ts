import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  AuthoringWizardComponent,
  type AuthoringDraft,
  type AuthoringWizardConfig,
} from './authoring-wizard';

/** Minimal in-memory localStorage stand-in so the draft store can persist. */
function installMemoryStorage(): Map<string, string> {
  const store = new Map<string, string>();
  const mock: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  };
  vi.stubGlobal('localStorage', mock);
  return store;
}

const CONFIG: AuthoringWizardConfig = {
  heading: 'Publicar producto',
  steps: [
    { id: 'datos', label: 'Datos' },
    { id: 'media', label: 'Fotos' },
    { id: 'precio', label: 'Precio' },
    { id: 'revisar', label: 'Revisar' },
  ],
  publishLabel: 'Publicar',
  draftScope: 'spec-authoring',
};

@Component({
  standalone: true,
  imports: [AuthoringWizardComponent],
  template: `
    <ng-template #step let-current let-draft="draft" let-patch="patch">
      <p class="step-body" [attr.data-step]="current.id">{{ draft['title'] || 'sin título' }}</p>
      <button type="button" class="patch-btn" (click)="patch({ title: 'Audífonos' })">
        set title
      </button>
    </ng-template>
    <syn-authoring-wizard
      [config]="config()"
      [stepTemplate]="step"
      [validity]="validity()"
      [publishing]="publishing()"
      (stepchange)="stepLog.push($event)"
      (draftchange)="draftLog.push($event)"
      (published)="publishedLog.push($event)"
      (exit)="exits = exits + 1"
    />
  `,
})
class HostComponent {
  readonly config = signal<AuthoringWizardConfig>(CONFIG);
  readonly validity = signal<Readonly<Record<string, boolean>>>({});
  readonly publishing = signal(false);
  readonly stepLog: string[] = [];
  readonly draftLog: AuthoringDraft[] = [];
  readonly publishedLog: AuthoringDraft[] = [];
  exits = 0;
}

describe(AuthoringWizardComponent.name, () => {
  async function createHost() {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  function wizardOf(fixture: ComponentFixture<HostComponent>): AuthoringWizardComponent {
    return fixture.debugElement.query(By.directive(AuthoringWizardComponent))
      .componentInstance as AuthoringWizardComponent;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  // ── empty ───────────────────────────────────────────────────────────────────
  it('starts on the first step with an empty draft and exits from step one (empty case)', async () => {
    installMemoryStorage();
    const fixture = await createHost();
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('.syn-authoring__heading')?.textContent).toContain(
      'Publicar producto',
    );
    expect(element.querySelectorAll('.syn-authoring__step')).toHaveLength(4);
    expect(element.querySelector('.step-body')?.getAttribute('data-step')).toBe('datos');
    expect(element.querySelector('.step-body')?.textContent).toContain('sin título');

    // Back on the very first step backs out of the wizard.
    element.querySelectorAll<HTMLButtonElement>('.syn-authoring__btn')[0].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.exits).toBe(1);
  });

  // ── happy ───────────────────────────────────────────────────────────────────
  it('patches the draft, walks every step and publishes the payload (happy case)', async () => {
    installMemoryStorage();
    const fixture = await createHost();
    const host = fixture.componentInstance;
    const element: HTMLElement = fixture.nativeElement;

    element.querySelector<HTMLButtonElement>('.patch-btn')!.click();
    fixture.detectChanges();
    expect(host.draftLog).toEqual([{ title: 'Audífonos' }]);
    expect(element.querySelector('.step-body')?.textContent).toContain('Audífonos');

    const wizard = wizardOf(fixture);
    wizard.next();
    wizard.next();
    wizard.next();
    fixture.detectChanges();
    expect(host.stepLog).toEqual(['media', 'precio', 'revisar']);
    expect(wizard.isLastStep()).toBe(true);
    expect(element.querySelectorAll('.syn-authoring__btn')[1].textContent).toContain('Publicar');

    wizard.next(); // final step → publish
    fixture.detectChanges();
    expect(host.publishedLog).toEqual([{ title: 'Audífonos' }]);
  });

  // ── filter (gating) ─────────────────────────────────────────────────────────
  it('blocks advancing while the current step is invalid or publishing (filter case)', async () => {
    installMemoryStorage();
    const fixture = await createHost();
    const host = fixture.componentInstance;
    host.validity.set({ datos: false });
    fixture.detectChanges();

    const wizard = wizardOf(fixture);
    const element: HTMLElement = fixture.nativeElement;
    const nextBtn = element.querySelectorAll<HTMLButtonElement>('.syn-authoring__btn')[1];
    expect(nextBtn.disabled).toBe(true);
    wizard.next();
    expect(wizard.stepIndex()).toBe(0);

    host.validity.set({ datos: true });
    fixture.detectChanges();
    wizard.next();
    expect(wizard.stepIndex()).toBe(1);

    // Publishing gates the final submit (and the back button).
    wizard.next();
    wizard.next();
    host.publishing.set(true);
    fixture.detectChanges();
    expect(nextBtn.textContent).toContain('Publicando…');
    wizard.next();
    expect(host.publishedLog).toEqual([]);
    wizard.previous();
    expect(wizard.stepIndex()).toBe(3);
  });

  // ── idempotent ─────────────────────────────────────────────────────────────
  it('rehydrates the persisted draft for the same scope and resets clean (idempotent case)', async () => {
    installMemoryStorage();
    const first = await createHost();
    const firstElement: HTMLElement = first.nativeElement;
    firstElement.querySelector<HTMLButtonElement>('.patch-btn')!.click();
    first.detectChanges();
    first.destroy();

    // Same storage, fresh component → the draft survives (scope-keyed).
    const second = TestBed.createComponent(HostComponent);
    second.detectChanges();
    expect(second.nativeElement.querySelector('.step-body')?.textContent).toContain('Audífonos');

    // Patching the same values keeps a stable draft (merge is idempotent).
    const wizard = wizardOf(second);
    wizard.patchDraft({ title: 'Audífonos' });
    expect(wizard.draft()).toEqual({ title: 'Audífonos' });

    // resetDraft clears storage and restarts the wizard.
    wizard.resetDraft();
    second.detectChanges();
    expect(wizard.draft()).toEqual({});
    expect(wizard.stepIndex()).toBe(0);
    second.destroy();

    const third = TestBed.createComponent(HostComponent);
    third.detectChanges();
    expect(third.nativeElement.querySelector('.step-body')?.textContent).toContain('sin título');
  });
});
