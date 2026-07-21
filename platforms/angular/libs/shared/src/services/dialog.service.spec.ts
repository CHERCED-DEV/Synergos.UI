import { TestBed } from '@angular/core/testing';
import { DialogService } from './dialog.service';
import { FocusManagerService } from './focus-manager.service';
import { LiveAnnouncerService } from './live-announcer.service';

describe(DialogService.name, () => {
  let service: DialogService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DialogService, FocusManagerService, LiveAnnouncerService],
    });

    service = TestBed.inject(DialogService);
  });

  it('opens dialogs and tracks the active one', () => {
    const id = service.open({ title: 'Preferences' });

    expect(service.isOpen(id)).toBe(true);
    expect(service.activeDialog()?.title).toBe('Preferences');
    expect(service.count()).toBe(1);
  });

  it('focuses the registered container and restores previous focus on close', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open';
    document.body.appendChild(trigger);
    trigger.focus();

    const dialogId = service.open({
      initialFocusSelector: '[data-primary-action]',
      title: 'Filters',
    });
    const container = document.createElement('div');
    const action = document.createElement('button');
    action.setAttribute('data-primary-action', 'true');
    action.textContent = 'Apply';
    container.appendChild(action);
    document.body.appendChild(container);

    service.registerContainer(dialogId, container);
    await Promise.resolve();

    expect(document.activeElement).toBe(action);

    service.close(dialogId);
    await Promise.resolve();

    expect(document.activeElement).toBe(trigger);

    container.remove();
    trigger.remove();
  });
});
