import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { RichTooltipElementComponent } from './rich-tooltip/rich-tooltip';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-rich-tooltip')) {
    const RichTooltipElement = createCustomElement(RichTooltipElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-rich-tooltip', RichTooltipElement);
  }
});
