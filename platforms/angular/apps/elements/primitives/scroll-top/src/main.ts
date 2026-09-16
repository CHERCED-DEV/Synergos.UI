import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { ScrollTopElementComponent } from './scroll-top/scroll-top';

registrarElementoAngular('synergos-scroll-top', ScrollTopElementComponent, appConfig);
