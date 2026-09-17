import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { CardComponent } from './card/card';

registrarElementoAngular('synergos-card', CardComponent, appConfig);
