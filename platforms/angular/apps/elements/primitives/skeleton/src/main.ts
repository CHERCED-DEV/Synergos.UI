import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { SkeletonElementComponent } from './skeleton/skeleton';

registrarElementoAngular('synergos-skeleton', SkeletonElementComponent, appConfig);
