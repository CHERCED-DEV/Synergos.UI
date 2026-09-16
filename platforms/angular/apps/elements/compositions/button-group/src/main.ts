import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { ButtonGroupComponent } from './button-group/button-group';

registrarElementoAngular('synergos-button-group', ButtonGroupComponent, appConfig);
