import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { PopoverElementComponent } from './popover/popover';

registrarElementoAngular('synergos-popover', PopoverElementComponent, appConfig);
