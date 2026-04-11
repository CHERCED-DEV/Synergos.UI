import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { VariantPickerComponent } from './variant-picker/variant-picker';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-variant-picker')) {
    customElements.define(
      'synergos-variant-picker',
      createCustomElement(VariantPickerComponent, { injector: appRef.injector }),
    );
  }
});
