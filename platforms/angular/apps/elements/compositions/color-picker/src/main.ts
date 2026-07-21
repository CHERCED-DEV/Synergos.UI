import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { ColorPickerElementComponent } from './color-picker/color-picker';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-color-picker')) {
    const ColorPickerElement = createCustomElement(ColorPickerElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-color-picker', ColorPickerElement);
  }
});
