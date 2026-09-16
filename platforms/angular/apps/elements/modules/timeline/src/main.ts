import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { TimelineElementComponent } from './timeline/timeline';

registrarElementoAngular('synergos-timeline', TimelineElementComponent, appConfig);
