import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { PollElementComponent } from './poll/poll';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-poll')) {
    const PollElement = createCustomElement(PollElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-poll', PollElement);
  }
});
