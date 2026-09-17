import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { ShareBarElementComponent } from './share-bar/share-bar';

registrarElementoAngular('synergos-share-bar', ShareBarElementComponent, appConfig);
