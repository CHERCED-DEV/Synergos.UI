import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { FaqSectionComponent } from './faq-section/faq-section';

registrarElementoAngular('synergos-faq-section', FaqSectionComponent, appConfig);
