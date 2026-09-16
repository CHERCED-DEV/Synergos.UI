import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { PaginationElementComponent } from './pagination/pagination';

registrarElementoAngular('synergos-pagination', PaginationElementComponent, appConfig);
