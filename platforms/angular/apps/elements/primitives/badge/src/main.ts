import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { BadgeElementComponent } from './badge/badge';

registrarElementoAngular('synergos-badge', BadgeElementComponent, appConfig);
