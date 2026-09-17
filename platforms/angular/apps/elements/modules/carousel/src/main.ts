import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { CarouselElementComponent } from './carousel/carousel';

registrarElementoAngular('synergos-carousel', CarouselElementComponent, appConfig);
