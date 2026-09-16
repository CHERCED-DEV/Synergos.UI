import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { IconLabelElementComponent } from './icon-label/icon-label';

registrarElementoAngular('synergos-icon-label', IconLabelElementComponent, appConfig);
