import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { SelectMultiElementComponent } from './select-multi/select-multi';

registrarElementoAngular('synergos-select-multi', SelectMultiElementComponent, appConfig);
