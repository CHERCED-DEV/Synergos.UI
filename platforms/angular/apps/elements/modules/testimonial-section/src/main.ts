import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { TestimonialSectionComponent } from './testimonial-section/testimonial-section';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-testimonial-section')) {
    const TestimonialSectionElement = createCustomElement(TestimonialSectionComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-testimonial-section', TestimonialSectionElement);
  }
});
