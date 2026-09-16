import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { LinkBlockComponent } from './link-block/link-block';

registrarElementoAngular('synergos-link-block', LinkBlockComponent, appConfig);
