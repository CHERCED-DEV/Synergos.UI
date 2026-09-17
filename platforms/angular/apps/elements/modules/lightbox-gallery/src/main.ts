import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { LightboxGalleryElementComponent } from './lightbox-gallery/lightbox-gallery';

registrarElementoAngular('synergos-lightbox-gallery', LightboxGalleryElementComponent, appConfig);
