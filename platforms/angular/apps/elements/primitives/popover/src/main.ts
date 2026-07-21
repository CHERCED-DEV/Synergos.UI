import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { PopoverElementComponent } from './popover/popover';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-popover')) {
    const PopoverElement = createCustomElement(PopoverElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-popover', PopoverElement);
  }
});
