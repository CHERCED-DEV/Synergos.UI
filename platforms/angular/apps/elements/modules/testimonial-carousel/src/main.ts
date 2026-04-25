import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { TestimonialCarouselElementComponent } from './testimonial-carousel/testimonial-carousel';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-testimonial-carousel')) {
    const TestimonialCarouselElement = createCustomElement(TestimonialCarouselElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-testimonial-carousel', TestimonialCarouselElement);
  }
});
