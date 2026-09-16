import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { DropdownElementComponent } from './dropdown/dropdown';

registrarElementoAngular('synergos-dropdown', DropdownElementComponent, appConfig);
