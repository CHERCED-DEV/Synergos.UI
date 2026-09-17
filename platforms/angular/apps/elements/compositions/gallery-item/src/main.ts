import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { GalleryItemElementComponent } from './gallery-item/gallery-item';

registrarElementoAngular('synergos-gallery-item', GalleryItemElementComponent, appConfig);
