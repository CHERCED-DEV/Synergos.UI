import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { BannerSliderElementComponent } from './banner-slider/banner-slider';

registrarElementoAngular('synergos-banner-slider', BannerSliderElementComponent, appConfig);
