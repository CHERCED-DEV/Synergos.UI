import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { SeatMapElementComponent } from './seat-map/seat-map';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-seat-map')) {
    const SeatMapElement = createCustomElement(SeatMapElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-seat-map', SeatMapElement);
  }
});
