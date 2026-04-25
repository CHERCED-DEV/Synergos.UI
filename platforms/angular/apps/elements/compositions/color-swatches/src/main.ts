import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { ColorSwatchesElementComponent } from './color-swatches/color-swatches';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-color-swatches')) {
    const ColorSwatchesElement = createCustomElement(ColorSwatchesElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-color-swatches', ColorSwatchesElement);
  }
});
