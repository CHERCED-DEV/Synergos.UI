import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { PollElementComponent } from './poll/poll';

registrarElementoAngular('synergos-poll', PollElementComponent, appConfig);
