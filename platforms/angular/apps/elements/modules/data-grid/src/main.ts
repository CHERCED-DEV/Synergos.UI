import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { DataGridElementComponent } from './data-grid/data-grid';

registrarElementoAngular('synergos-data-grid', DataGridElementComponent, appConfig);
