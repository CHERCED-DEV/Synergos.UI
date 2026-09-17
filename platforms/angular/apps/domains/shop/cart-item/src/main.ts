import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { CartItemComponent } from '@synergos/shop';

registrarElementoAngular('synergos-cart-item', CartItemComponent, appConfig);
