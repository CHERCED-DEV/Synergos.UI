import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { GovElementComponent } from './gov/gov';

registrarElementoAngular('synergos-gov', GovElementComponent, appConfig);
