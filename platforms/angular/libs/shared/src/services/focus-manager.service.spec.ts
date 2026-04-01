import { TestBed } from '@angular/core/testing';
import { FocusManagerService } from './focus-manager.service';

describe(FocusManagerService.name, () => {
  let service: FocusManagerService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FocusManagerService],
    });

    service = TestBed.inject(FocusManagerService);
  });

  it('returns focusable elements from a container', () => {
    const container = document.createElement('div');
    container.innerHTML = '<button type="button">One</button><div>Two</div><a href="/">Three</a>';

    expect(service.getFocusableElements(container)).toHaveLength(2);
  });

  it('detects whether focus is within a container', () => {
    const container = document.createElement('div');
    const button = document.createElement('button');
    container.appendChild(button);
    document.body.appendChild(container);

    button.focus();

    expect(service.isFocusWithin(container)).toBe(true);

    container.remove();
  });
});
