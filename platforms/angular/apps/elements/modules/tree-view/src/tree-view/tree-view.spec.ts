import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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
