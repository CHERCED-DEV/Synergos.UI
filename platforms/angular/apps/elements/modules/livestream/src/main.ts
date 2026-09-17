import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { LivestreamElementComponent } from './livestream/livestream';

registrarElementoAngular('synergos-livestream', LivestreamElementComponent, appConfig);
