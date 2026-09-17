import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { SearchBoxElementComponent } from './search-box/search-box';

registrarElementoAngular('synergos-search-box', SearchBoxElementComponent, appConfig);
