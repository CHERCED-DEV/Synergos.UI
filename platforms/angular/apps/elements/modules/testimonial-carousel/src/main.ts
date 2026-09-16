import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { TestimonialCarouselElementComponent } from './testimonial-carousel/testimonial-carousel';

registrarElementoAngular('synergos-testimonial-carousel', TestimonialCarouselElementComponent, appConfig);
