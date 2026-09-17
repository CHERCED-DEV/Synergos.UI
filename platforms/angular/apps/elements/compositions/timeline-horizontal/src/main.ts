import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { TimelineHorizontalElementComponent } from './timeline-horizontal/timeline-horizontal';

registrarElementoAngular('synergos-timeline-horizontal', TimelineHorizontalElementComponent, appConfig);
