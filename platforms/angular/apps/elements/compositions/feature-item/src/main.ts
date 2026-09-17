import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { FeatureItemComponent } from './feature-item/feature-item';

registrarElementoAngular('synergos-feature-item', FeatureItemComponent, appConfig);
