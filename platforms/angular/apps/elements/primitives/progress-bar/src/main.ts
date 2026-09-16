import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { ProgressBarElementComponent } from './progress-bar/progress-bar';

registrarElementoAngular('synergos-progress-bar', ProgressBarElementComponent, appConfig);
