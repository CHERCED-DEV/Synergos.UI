import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { MediaTextComponent } from './media-text/media-text';

registrarElementoAngular('synergos-media-text', MediaTextComponent, appConfig);
