import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { CtaGroupComponent } from './cta-group/cta-group';

registrarElementoAngular('synergos-cta-group', CtaGroupComponent, appConfig);
