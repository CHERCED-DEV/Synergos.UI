import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { KpiCardElementComponent } from './kpi-card/kpi-card';

registrarElementoAngular('synergos-kpi-card', KpiCardElementComponent, appConfig);
