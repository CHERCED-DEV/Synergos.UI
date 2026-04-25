import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { AutocompleteElementComponent } from './autocomplete/autocomplete';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-autocomplete')) {
    const AutocompleteElement = createCustomElement(AutocompleteElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-autocomplete', AutocompleteElement);
  }
});
