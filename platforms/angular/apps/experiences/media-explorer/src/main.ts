import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { MediaExplorerComponent } from './media-explorer/interface/media-explorer';

registrarElementoAngular('synergos-media-explorer', MediaExplorerComponent, appConfig);
