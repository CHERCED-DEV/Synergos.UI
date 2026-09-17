import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { CartSummaryComponent } from './cart-summary/cart-summary';

registrarElementoAngular('synergos-cart-summary', CartSummaryComponent, appConfig);
