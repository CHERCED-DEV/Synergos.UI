import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { TourGuideElementComponent } from './tour-guide/tour-guide';

registrarElementoAngular('synergos-tour-guide', TourGuideElementComponent, appConfig);
