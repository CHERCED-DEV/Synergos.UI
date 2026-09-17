import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { PaxSelectorElementComponent } from './pax-selector/pax-selector';

registrarElementoAngular('synergos-pax-selector', PaxSelectorElementComponent, appConfig);
