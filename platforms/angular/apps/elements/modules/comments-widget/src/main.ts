import { registrarElementoAngular } from '@synergos/core';
import { appConfig } from './app.config';
import { CommentsWidgetElementComponent } from './comments-widget/comments-widget';

registrarElementoAngular('synergos-comments-widget', CommentsWidgetElementComponent, appConfig);
