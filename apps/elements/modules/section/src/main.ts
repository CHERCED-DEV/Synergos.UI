import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { SectionComponent } from './section/section';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-section')) {
    const SectionElement = createCustomElement(SectionComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-section', SectionElement);
  }
});
