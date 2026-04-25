import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { RatingStarsElementComponent } from './rating-stars/rating-stars';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-rating-stars')) {
    const RatingStarsElement = createCustomElement(RatingStarsElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-rating-stars', RatingStarsElement);
  }
});
