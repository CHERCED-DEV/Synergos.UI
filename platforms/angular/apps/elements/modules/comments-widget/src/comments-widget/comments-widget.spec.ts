import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  CommentsWidgetElementComponent,
  type CommentSubmitDetail,
  buildCommentTree,
  normalizeComments,
} from './comments-widget';

const COMMENTS = JSON.stringify([
  { id: '1', author: 'Ana', body: 'Excelente artículo', createdAt: '2026-06-01' },
  { id: '2', parentId: '1', author: 'Beto', body: 'Totalmente de acuerdo' },
  { id: '3', author: 'Carlos', body: 'Tengo una duda' },
  { author: 'Sin id pero válido', body: 'Cuenta igual' },
  { author: 'Sin cuerpo — descartado' },
]);

describe('CommentsWidgetElementComponent', () => {
  let fixture: ComponentFixture<CommentsWidgetElementComponent>;
  let component: CommentsWidgetElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommentsWidgetElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(CommentsWidgetElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with no comments and show the empty state (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasComments()).toBe(false);
    expect(component.count()).toBe(0);
    expect(component.tree().length).toBe(0);
    expect(component.canSubmit()).toBe(false);
    expect(component.emptyLabel().length).toBeGreaterThan(0);
  });

  it('should render a nested thread from config + labels (render/config case)', async () => {
    fixture.componentRef.setInput('comments', COMMENTS);
    fixture.componentRef.setInput('title', 'Opiniones');
    fixture.componentRef.setInput('submitLabel', 'Enviar');
    fixture.detectChanges();
    await fixture.whenStable();

    // 4 valid comments survive (the body-less one is dropped).
    expect(component.count()).toBe(4);
    expect(component.title()).toBe('Opiniones');
    expect(component.submitLabel()).toBe('Enviar');

    // Two roots ("1" and "3" and the id-less one); "2" nests under "1".
    const tree = component.tree();
    const root1 = tree.find((node) => node.comment.id === '1');
    expect(root1).toBeDefined();
    expect(root1!.replies.length).toBe(1);
    expect(root1!.replies[0].comment.author).toBe('Beto');
    expect(root1!.replies[0].depth).toBe(1);
    expect(component.flatNodes().length).toBe(4);
  });

  it('should submit a reply, emit commentsubmit and append optimistically (interaction case)', async () => {
    fixture.componentRef.setInput('comments', COMMENTS);
    fixture.componentRef.setInput('threadId', 'post-42');
    fixture.detectChanges();
    await fixture.whenStable();

    let emitted: CommentSubmitDetail | undefined;
    component.commentsubmit.subscribe((detail) => (emitted = detail));

    const before = component.count();
    const target = component.allComments().find((c) => c.id === '3');
    expect(target).toBeDefined();

    component.startReply(target!);
    expect(component.isReplyingTo(target!)).toBe(true);

    component.draftAuthor.set('Diana');
    component.draftBody.set('Yo te respondo');
    component.submit();

    expect(emitted).toBeDefined();
    expect(emitted!.threadId).toBe('post-42');
    expect(emitted!.parentId).toBe('3');
    expect(emitted!.author).toBe('Diana');
    expect(emitted!.body).toBe('Yo te respondo');

    // Optimistic append nests the new comment under "3".
    expect(component.count()).toBe(before + 1);
    expect(component.replyingTo()).toBeNull();
    const root3 = component.tree().find((node) => node.comment.id === '3');
    expect(root3!.replies.some((r) => r.comment.body === 'Yo te respondo')).toBe(true);
  });

  it('should let direct inputs override config and ignore blank submits (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', '{"locale":"en-US","submitLabel":"Send"}');
    fixture.componentRef.setInput('submitLabel', 'Publicar');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.submitLabel()).toBe('Publicar');
    expect(component.locale()).toBe('en-US');

    let emissions = 0;
    component.commentsubmit.subscribe(() => (emissions += 1));

    // Blank / whitespace-only drafts must be no-ops (idempotent — no growth).
    const before = component.count();
    component.draftBody.set('   ');
    component.submit();
    component.draftBody.set('');
    component.submit();

    expect(emissions).toBe(0);
    expect(component.count()).toBe(before);
  });
});

describe('comments-widget pure helpers', () => {
  it('normalizeComments drops entries without a body and defaults the author', () => {
    const list = normalizeComments([
      { id: 'a', body: 'Hola' },
      { id: 'b' },
      { body: 'Sin autor' },
      'no-objeto',
    ]);
    expect(list.length).toBe(2);
    expect(list[0].author).toBe('Anónimo');
    expect(list[1].body).toBe('Sin autor');
  });

  it('buildCommentTree nests replies under their parent and is cycle-safe', () => {
    const tree = buildCommentTree([
      { id: '1', parentId: '', author: 'A', body: 'root', createdAt: '' },
      { id: '2', parentId: '1', author: 'B', body: 'child', createdAt: '' },
      { id: '3', parentId: '3', author: 'C', body: 'self-parent', createdAt: '' },
    ]);
    expect(tree.length).toBe(2);
    const root = tree.find((node) => node.comment.id === '1');
    expect(root!.replies.length).toBe(1);
    expect(root!.replies[0].comment.id).toBe('2');
  });
});
