import { TestBed } from '@angular/core/testing';
import { CustomElementHostService } from './custom-element-host.service';

describe(CustomElementHostService.name, () => {
  let service: CustomElementHostService;
  let container: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CustomElementHostService],
    });

    service = TestBed.inject(CustomElementHostService);
    container = document.createElement('div');
  });

  it('returns null when the tag name is empty', () => {
    expect(service.mount(container, { tagName: '  ' })).toBeNull();
  });

  it('mounts an element and applies properties', () => {
    const mounted = service.mount(container, {
      tagName: 'demo-card',
      props: {
        label: 'Featured',
        count: 2,
        active: true,
        payload: { ok: true },
      },
      textContent: 'Hello',
    }) as HTMLElement & Record<string, unknown>;

    expect(mounted.tagName.toLowerCase()).toBe('demo-card');
    expect(mounted.getAttribute('label')).toBe('Featured');
    expect(mounted.getAttribute('count')).toBe('2');
    expect(mounted.getAttribute('active')).toBe('true');
    expect(mounted['payload']).toEqual({ ok: true });
    expect(mounted.textContent).toBe('Hello');
  });

  it('replaces previous mounted content', () => {
    service.mount(container, { tagName: 'demo-one' });
    service.mount(container, { tagName: 'demo-two' });

    expect(container.children.length).toBe(1);
    expect(container.firstElementChild?.tagName.toLowerCase()).toBe('demo-two');
  });
});
