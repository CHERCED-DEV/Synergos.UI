import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { ProductCardComponent } from './product-card/product-card';

registrarElementoAngular('synergos-product-card', ProductCardComponent, appConfig);
