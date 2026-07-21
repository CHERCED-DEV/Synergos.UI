import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { KpiCardElementComponent } from './kpi-card/kpi-card';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-kpi-card')) {
    const KpiCardElement = createCustomElement(KpiCardElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-kpi-card', KpiCardElement);
  }
});
