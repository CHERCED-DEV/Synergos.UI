import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { ChartBarElementComponent } from './chart-bar/chart-bar';

registrarElementoAngular('synergos-chart-bar', ChartBarElementComponent, appConfig);
