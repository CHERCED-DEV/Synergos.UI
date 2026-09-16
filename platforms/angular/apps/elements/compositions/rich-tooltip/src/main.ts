import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { RichTooltipElementComponent } from './rich-tooltip/rich-tooltip';

registrarElementoAngular('synergos-rich-tooltip', RichTooltipElementComponent, appConfig);
