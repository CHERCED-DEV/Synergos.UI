import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { HeroBannerElementComponent } from './hero-banner/hero-banner';

registrarElementoAngular('synergos-hero-banner', HeroBannerElementComponent, appConfig);
