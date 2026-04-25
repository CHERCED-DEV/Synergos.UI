import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { TreeViewElementComponent } from './tree-view/tree-view';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-tree-view')) {
    const TreeViewElement = createCustomElement(TreeViewElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-tree-view', TreeViewElement);
  }
});
