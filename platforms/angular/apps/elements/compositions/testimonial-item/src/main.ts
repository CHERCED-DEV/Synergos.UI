import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { TestimonialItemElementComponent } from './testimonial-item/testimonial-item';

registrarElementoAngular('synergos-testimonial-item', TestimonialItemElementComponent, appConfig);
