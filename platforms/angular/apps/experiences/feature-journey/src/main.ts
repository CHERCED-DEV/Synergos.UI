import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { FeatureJourneyComponent } from './feature-journey/interface/feature-journey';

registrarElementoAngular('synergos-feature-journey', FeatureJourneyComponent, appConfig);
