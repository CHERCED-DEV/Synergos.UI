import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { ScrollTopElementComponent } from './scroll-top/scroll-top';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-scroll-top')) {
    const ScrollTopElement = createCustomElement(ScrollTopElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-scroll-top', ScrollTopElement);
  }
});
