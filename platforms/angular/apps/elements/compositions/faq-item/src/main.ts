import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { FaqItemElementComponent } from './faq-item/faq-item';

registrarElementoAngular('synergos-faq-item', FaqItemElementComponent, appConfig);
