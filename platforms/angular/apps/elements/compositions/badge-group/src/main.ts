import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { BadgeGroupElementComponent } from './badge-group/badge-group';

registrarElementoAngular('synergos-badge-group', BadgeGroupElementComponent, appConfig);
