import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { ChartBarElementComponent } from './chart-bar/chart-bar';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-chart-bar')) {
    const ChartBarElement = createCustomElement(ChartBarElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-chart-bar', ChartBarElement);
  }
});
