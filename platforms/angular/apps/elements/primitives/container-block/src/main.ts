import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { ContainerBlockComponent } from './container-block/container-block';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-container-block')) {
    const ContainerBlockElement = createCustomElement(ContainerBlockComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-container-block', ContainerBlockElement);
  }
});
