import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { EhrElementComponent } from './ehr/ehr';

registrarElementoAngular('synergos-ehr', EhrElementComponent, appConfig);
