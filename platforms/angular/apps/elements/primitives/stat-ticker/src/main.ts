import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { StatTickerElementComponent } from './stat-ticker/stat-ticker';

registrarElementoAngular('synergos-stat-ticker', StatTickerElementComponent, appConfig);
