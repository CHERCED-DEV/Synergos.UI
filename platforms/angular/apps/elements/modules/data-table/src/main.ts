import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { DataTableElementComponent } from './data-table/data-table';

registrarElementoAngular('synergos-data-table', DataTableElementComponent, appConfig);
