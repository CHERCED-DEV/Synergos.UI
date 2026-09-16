import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { ButtonContainerComponent } from './button-container/button-container';

registrarElementoAngular('synergos-button-container', ButtonContainerComponent, appConfig);
