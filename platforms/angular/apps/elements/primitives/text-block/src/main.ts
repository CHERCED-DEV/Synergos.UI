import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { TextBlockComponent } from './text-block/text-block';

registrarElementoAngular('synergos-text-block', TextBlockComponent, appConfig);
