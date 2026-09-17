import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { InsightExplorerComponent } from './insight-explorer/interface/insight-explorer';

registrarElementoAngular('synergos-insight-explorer', InsightExplorerComponent, appConfig);
