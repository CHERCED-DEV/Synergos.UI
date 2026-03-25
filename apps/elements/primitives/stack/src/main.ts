import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { StackComponent } from './stack/stack';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-stack')) {
    const StackElement = createCustomElement(StackComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-stack', StackElement);
  }
});
