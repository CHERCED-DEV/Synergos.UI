import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { RangeSliderElementComponent } from './range-slider/range-slider';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-range-slider')) {
    const RangeSliderElement = createCustomElement(RangeSliderElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-range-slider', RangeSliderElement);
  }
});
