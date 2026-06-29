import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { EventosElementComponent } from './eventos/eventos';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-eventos')) {
    const EventosElement = createCustomElement(EventosElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-eventos', EventosElement);
  }
});
