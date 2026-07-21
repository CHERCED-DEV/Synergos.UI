import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { DropdownElementComponent } from './dropdown/dropdown';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-dropdown')) {
    const DropdownElement = createCustomElement(DropdownElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-dropdown', DropdownElement);
  }
});
