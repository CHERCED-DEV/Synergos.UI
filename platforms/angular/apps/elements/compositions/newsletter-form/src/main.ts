import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { NewsletterFormElementComponent } from './newsletter-form/newsletter-form';

registrarElementoAngular('synergos-newsletter-form', NewsletterFormElementComponent, appConfig);
