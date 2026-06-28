import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { AcademyElementComponent } from './academy/academy';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-academy')) {
    const AcademyElement = createCustomElement(AcademyElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-academy', AcademyElement);
  }
});
