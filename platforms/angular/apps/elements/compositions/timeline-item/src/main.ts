import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { TimelineItemElementComponent } from './timeline-item/timeline-item';

registrarElementoAngular('synergos-timeline-item', TimelineItemElementComponent, appConfig);
