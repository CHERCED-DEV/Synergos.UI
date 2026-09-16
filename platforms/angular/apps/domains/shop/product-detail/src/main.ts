import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { ProductDetailComponent } from './product-detail/product-detail';

registrarElementoAngular('synergos-product-detail', ProductDetailComponent, appConfig);
