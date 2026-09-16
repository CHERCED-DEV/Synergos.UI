import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { TooltipElementComponent } from './tooltip/tooltip';

registrarElementoAngular('synergos-tooltip', TooltipElementComponent, appConfig);
