import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { ProgressBarElementComponent } from './progress-bar/progress-bar';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-progress-bar')) {
    const ProgressBarElement = createCustomElement(ProgressBarElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-progress-bar', ProgressBarElement);
  }
});
