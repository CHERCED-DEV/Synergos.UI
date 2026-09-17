import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { TreeViewElementComponent } from './tree-view/tree-view';

registrarElementoAngular('synergos-tree-view', TreeViewElementComponent, appConfig);
