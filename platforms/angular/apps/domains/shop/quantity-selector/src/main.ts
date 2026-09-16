import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { QuantitySelectorComponent } from '@synergos/shop';

registrarElementoAngular('synergos-quantity-selector', QuantitySelectorComponent, appConfig);
