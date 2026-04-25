import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { SearchBoxElementComponent } from './search-box/search-box';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-search-box')) {
    const SearchBoxElement = createCustomElement(SearchBoxElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-search-box', SearchBoxElement);
  }
});
