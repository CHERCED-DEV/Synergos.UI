import { TestBed } from '@angular/core/testing';
import { ScriptService } from './script.service';

describe(ScriptService.name, () => {
  let service: ScriptService;

  beforeEach(() => {
    document.head.innerHTML = '';

    TestBed.configureTestingModule({
      providers: [ScriptService],
    });

    service = TestBed.inject(ScriptService);
  });

  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('adds scripts to the document head', () => {
    const script = service.addScript({
      id: 'analytics-script',
      src: 'https://cdn.example.com/analytics.js',
    });

    expect(script?.id).toBe('analytics-script');
    expect(document.head.querySelector('#analytics-script')).toBe(script);
  });

  it('reuses existing scripts with the same id', () => {
    const first = service.addScript({ id: 'shared-script', body: 'window.__shared=true;' });
    const second = service.addScript({ id: 'shared-script', body: 'window.__shared=false;' });

    expect(first).toBe(second);
  });
});
