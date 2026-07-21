import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { StatTickerElementComponent } from './stat-ticker/stat-ticker';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-stat-ticker')) {
    const StatTickerElement = createCustomElement(StatTickerElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-stat-ticker', StatTickerElement);
  }
});
