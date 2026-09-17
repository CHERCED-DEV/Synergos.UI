import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { FeatureGridComponent } from './feature-grid/feature-grid';

registrarElementoAngular('synergos-feature-grid', FeatureGridComponent, appConfig);
