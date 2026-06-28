import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { BlogsElementComponent } from './blogs/blogs';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-blogs')) {
    const BlogsElement = createCustomElement(BlogsElementComponent, {
      injector: appRef.injector,
    });
    customElements.define('synergos-blogs', BlogsElement);
  }
});
