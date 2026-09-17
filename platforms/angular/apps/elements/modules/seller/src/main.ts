import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { SellerElementComponent } from './seller/seller';

registrarElementoAngular('synergos-seller', SellerElementComponent, appConfig);
