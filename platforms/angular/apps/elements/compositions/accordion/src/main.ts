import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { AccordionElementComponent } from './accordion/accordion';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-accordion')) {
    const AccordionElement = createCustomElement(AccordionElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-accordion', AccordionElement);
  }
});
