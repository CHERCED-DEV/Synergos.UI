import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { appConfig } from './app.config';
import { TestimonialItemElementComponent } from './testimonial-item/testimonial-item';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-testimonial-item')) {
    const TestimonialItemElement = createCustomElement(TestimonialItemElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-testimonial-item', TestimonialItemElement);
  }
});
