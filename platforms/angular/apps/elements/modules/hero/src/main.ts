import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { HeroComponent } from './hero/hero';

registrarElementoAngular('synergos-hero', HeroComponent, appConfig);
