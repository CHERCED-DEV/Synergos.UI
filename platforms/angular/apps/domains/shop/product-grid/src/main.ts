import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { ProductGridComponent } from './product-grid/product-grid';

registrarElementoAngular('synergos-product-grid', ProductGridComponent, appConfig);
