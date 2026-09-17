import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { SpacerComponent } from './spacer/spacer';

registrarElementoAngular('synergos-spacer', SpacerComponent, appConfig);
