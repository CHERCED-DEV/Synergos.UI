import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { TestimonialSectionComponent } from './testimonial-section/testimonial-section';

registrarElementoAngular('synergos-testimonial-section', TestimonialSectionComponent, appConfig);
