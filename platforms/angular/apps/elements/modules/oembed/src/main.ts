import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { OembedElementComponent } from './oembed/oembed';

registrarElementoAngular('synergos-oembed', OembedElementComponent, appConfig);
