import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { appConfig } from './app.config';
import { ExternalWidgetElementComponent } from './external-widget/external-widget';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-external-widget')) {
    const ExternalWidgetElement = createCustomElement(ExternalWidgetElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-external-widget', ExternalWidgetElement);
  }
});
