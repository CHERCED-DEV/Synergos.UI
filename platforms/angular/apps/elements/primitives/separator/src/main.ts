import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { SeparatorElementComponent } from './separator/separator';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-separator')) {
    const SeparatorElement = createCustomElement(SeparatorElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-separator', SeparatorElement);
  }
});
