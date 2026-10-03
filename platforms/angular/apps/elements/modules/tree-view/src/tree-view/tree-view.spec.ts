import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TREE_VIEW_SYNHOST } from '@synergos/contracts';
import {
  TreeViewElementComponent,
  type TreeNodeSelectDetail,
  normalizeTree,
} from './tree-view';

const TREE = JSON.stringify([
  {
    id: 'docs',
    label: 'Documentos',
    children: [
      { id: 'docs-a', label: 'Informe.pdf' },
      {
        id: 'docs-sub',
        label: 'Subcarpeta',
        children: [{ id: 'docs-sub-1', label: 'Nota.txt' }],
      },
    ],
  },
  { id: 'imagenes', label: 'Imágenes' },
  { label: '   ', children: [] },
]);

describe('TreeViewElementComponent', () => {
  let fixture: ComponentFixture<TreeViewElementComponent>;
  let component: TreeViewElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TreeViewElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(TreeViewElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and resolve to no nodes (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasNodes()).toBe(false);
    expect(component.visibleNodes()).toEqual([]);
  });

  it('should render a collapsed tree from config, hiding children of collapsed branches (render + config case)', async () => {
    fixture.componentRef.setInput('treeJson', TREE);
    fixture.detectChanges();
    await fixture.whenStable();

    // Blank-labelled node is dropped → 2 roots, children hidden while collapsed.
    const visible = component.visibleNodes();
    expect(visible.map((node) => node.id)).toEqual(['docs', 'imagenes']);
    expect(visible[0].hasChildren).toBe(true);
    expect(visible[0].setSize).toBe(2);
    expect(visible[0].posInSet).toBe(1);
    expect(component.isExpanded(visible[0])).toBe(false);

    // expandAll surfaces every descendant.
    fixture.componentRef.setInput('expandAll', true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.visibleNodes().map((node) => node.id)).toEqual([
      'docs',
      'docs-a',
      'docs-sub',
      'docs-sub-1',
      'imagenes',
    ]);
  });

  it('should expand a branch and emit on selection (interaction case)', async () => {
    fixture.componentRef.setInput('treeJson', TREE);
    fixture.detectChanges();
    await fixture.whenStable();

    let emitted: TreeNodeSelectDetail | undefined;
    component.nodeselect.subscribe((detail) => (emitted = detail));

    const branch = component.visibleNodes().find((node) => node.id === 'docs')!;
    component.select(branch);

    // Selecting a branch toggles it open and emits the node detail.
    expect(component.isSelected(branch)).toBe(true);
    expect(component.isExpanded(branch)).toBe(true);
    expect(emitted).toEqual({ id: 'docs', label: 'Documentos', href: '' });
    expect(component.visibleNodes().map((node) => node.id)).toContain('docs-a');

    // Collapsing again hides the children.
    component.toggle(branch);
    expect(component.isExpanded(branch)).toBe(false);
    expect(component.visibleNodes().map((node) => node.id)).not.toContain('docs-a');
  });

  // D1: con `treeJson` —el TEXTO que mandaba la vista— el árbol salía vacío. Éste alimenta el
  // `config` EXACTO que emite hoy la vista del CMS: expandAll abre las ramas, a cualquier nivel.
  it('pinta el árbol que autoró el editor con el config exacto que emite la vista del CMS', async () => {
    const { ejemplo } = TREE_VIEW_SYNHOST;
    fixture.componentRef.setInput('config', JSON.stringify(ejemplo));
    fixture.detectChanges();
    await fixture.whenStable();

    const aplanar = (nodos: readonly { label: string; children?: readonly unknown[] }[]): string[] =>
      nodos.flatMap((n) => [n.label, ...aplanar((n.children ?? []) as never)]);
    expect(component.expandAll()).toBe(ejemplo.expandAll);
    expect(component.label()).toBe(ejemplo.label);
    expect(component.visibleNodes().map((n) => n.label)).toEqual(aplanar(ejemplo.tree ?? []));
    const arbol = (fixture.nativeElement as HTMLElement).querySelector('[role="tree"]');
    expect(arbol?.getAttribute('aria-label')).toBe(ejemplo.label);
  });

  // CMS#192: el `icon` de cada nodo se pintaba como TEXTO. Un nombre del set va por `syn-icon`
  // (SVG); un glifo literal se pinta tal cual; una palabra que el set no tiene, no se pinta.
  it('pinta el icono del nodo por nombre con syn-icon, el glifo tal cual, y no la palabra', async () => {
    fixture.componentRef.setInput(
      'config',
      JSON.stringify({
        tree: [
          { id: 'a', label: 'Usuarios', icon: 'users' },
          { id: 'b', label: 'Favoritos', icon: '★' },
          { id: 'c', label: 'Cohetes', icon: 'cohete' },
          { id: 'd', label: 'Sin icono' },
        ],
      }),
    );
    fixture.detectChanges();
    await fixture.whenStable();

    const filas = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('[role="treeitem"]'));
    const pinta = filas.map((fila) => {
      const icono = fila.querySelector('syn-icon');
      if (!icono) return '';
      return icono.querySelector('svg.syn-icon__svg') ? 'svg' : (icono.textContent ?? '').trim();
    });
    expect(pinta).toEqual(['svg', '★', '', '']);
    expect(filas[2].textContent).not.toContain('cohete');
  });

  it('should let direct inputs override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', '{"label":"Config label"}');
    fixture.componentRef.setInput('label', 'Input label');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.label()).toBe('Input label');

    // normalizeTree is pure: same input → same shape, blank labels dropped.
    const once = normalizeTree(JSON.parse(TREE));
    const twice = normalizeTree(JSON.parse(TREE));
    expect(once).toEqual(twice);
    expect(once.length).toBe(2);
  });
});

/** El puente que publica la página (ADR 0136): sólo las claves que se pasan. */
function publicar(keys: Record<string, string>): void {
  (window as { synergos?: unknown }).synergos = { i18n: { culture: 'en-US', defaultCulture: 'es-CO', keys } };
}

describe('tree-view — microcopia del diccionario (ADR 0136, sección TreeView)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TreeViewElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  afterEach(() => {
    delete (window as { synergos?: unknown }).synergos;
  });

  it('el botón de cada rama dice la acción de la clave, con el nombre del nodo como marcador', async () => {
    publicar({ 'TreeView.Collapse': 'Collapse {label}', 'TreeView.Expand': 'Expand {label}' });
    const fixture = TestBed.createComponent(TreeViewElementComponent);
    fixture.componentRef.setInput('config', JSON.stringify(TREE_VIEW_SYNHOST.ejemplo));
    fixture.detectChanges();
    await fixture.whenStable();

    const raiz = fixture.nativeElement as HTMLElement;
    const botones = Array.from(raiz.querySelectorAll('.tree-view__toggle[aria-label]'));
    // expandAll viene encendido en el ejemplo: las ramas están abiertas y el botón las contrae.
    expect(botones.map((b) => b.getAttribute('aria-label'))).toEqual(['Collapse Productos', 'Collapse Hogar']);
    // El nombre del árbol es contenido del editor: el diccionario no lo pisa.
    expect(raiz.querySelector('[role="tree"]')?.getAttribute('aria-label')).toBe(TREE_VIEW_SYNHOST.ejemplo.label);
  });

  it('sin árbol, el estado vacío es TreeView.Empty', async () => {
    publicar({ 'TreeView.Empty': 'No items to show.' });
    const fixture = TestBed.createComponent(TreeViewElementComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.emptyLabel()).toBe('No items to show.');
    // Lo que la página no publica sale por el respaldo es-CO.
    expect(fixture.componentInstance.label()).toBe('Árbol de navegación');
  });
});
