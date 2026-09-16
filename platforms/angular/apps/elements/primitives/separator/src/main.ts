import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { SeparatorElementComponent } from './separator/separator';

registrarElementoAngular('synergos-separator', SeparatorElementComponent, appConfig);
