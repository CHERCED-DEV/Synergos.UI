import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { BannerComponent } from './banner/banner';

registrarElementoAngular('synergos-banner', BannerComponent, appConfig);
