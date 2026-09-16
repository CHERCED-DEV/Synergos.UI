import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { AutocompleteElementComponent } from './autocomplete/autocomplete';

registrarElementoAngular('synergos-autocomplete', AutocompleteElementComponent, appConfig);
