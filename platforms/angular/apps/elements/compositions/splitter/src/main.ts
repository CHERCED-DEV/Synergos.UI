import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { SplitterElementComponent } from './splitter/splitter';

registrarElementoAngular('synergos-splitter', SplitterElementComponent, appConfig);
