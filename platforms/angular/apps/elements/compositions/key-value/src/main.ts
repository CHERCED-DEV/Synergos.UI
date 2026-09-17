import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { KeyValueElementComponent } from './key-value/key-value';

registrarElementoAngular('synergos-key-value', KeyValueElementComponent, appConfig);
