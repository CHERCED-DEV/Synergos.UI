import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { TooltipElementComponent } from './tooltip/tooltip';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-tooltip')) {
    const TooltipElement = createCustomElement(TooltipElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-tooltip', TooltipElement);
  }
});
