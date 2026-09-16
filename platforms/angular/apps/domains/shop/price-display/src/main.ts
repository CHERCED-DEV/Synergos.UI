import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { PriceDisplayComponent } from '@synergos/shop';

registrarElementoAngular('synergos-price-display', PriceDisplayComponent, appConfig);
