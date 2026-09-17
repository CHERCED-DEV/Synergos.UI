import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { StorefrontElementComponent } from './storefront/storefront';

registrarElementoAngular('synergos-storefront', StorefrontElementComponent, appConfig);
