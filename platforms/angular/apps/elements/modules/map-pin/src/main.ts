import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { MapPinElementComponent } from './map-pin/map-pin';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-map-pin')) {
    const MapPinElement = createCustomElement(MapPinElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-map-pin', MapPinElement);
  }
});
