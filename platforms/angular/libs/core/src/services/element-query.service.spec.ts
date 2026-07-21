import { TestBed } from '@angular/core/testing';
import { ElementQueryService } from './element-query.service';

describe(ElementQueryService.name, () => {
  let service: ElementQueryService;

  beforeEach(() => {
    document.body.innerHTML = `
      <form id="test-form">
        <input id="first-name" />
        <input id="email" class="ng-invalid" aria-invalid="true" />
      </form>
    `;

    TestBed.configureTestingModule({
      providers: [ElementQueryService],
    });

    service = TestBed.inject(ElementQueryService);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('finds descendants by selector and returns the first invalid element', () => {
    const form = document.getElementById('test-form') as HTMLElement;

    expect(service.findAll(form, 'input')).toHaveLength(2);
    expect(service.findFirstInvalid(form)?.id).toBe('email');
  });
});
