/**
 * Lo que hay que hacer UNA vez antes de que corra el primer spec de Angular.
 *
 * `TestBed` no funciona hasta que alguien le dice contra qué plataforma va a
 * compilar. Con la CLI eso lo hacía el builder por debajo; sin CLI hay que
 * decirlo acá, y si falta el síntoma es un error genérico de «test environment
 * not initialized» que no menciona este fichero.
 *
 * El import de `@angular/compiler` es OBLIGATORIO y va PRIMERO: es el que
 * registra el compilador JIT. Sin él, el primer componente con plantilla falla
 * pidiendo que se compilen los componentes — un error que suena a que falta
 * `compileComponents()` en el spec, y manda a arreglar el sitio equivocado.
 */
import '@angular/compiler';

import { NgModule, provideZonelessChangeDetection } from '@angular/core';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';

/**
 * Zoneless por defecto, que es como corre el producto.
 *
 * Este repo no carga Zone.js: `provideZonelessChangeDetection()` está en el
 * `appConfig` de los 139 elementos. Un TestBed con zonas probaría un Angular
 * que no es el que se publica — y la diferencia no es teórica: con zonas, un
 * `fixture.detectChanges()` de más tapa una detección que en producción no
 * ocurre.
 *
 * Los specs que ya lo declaran en sus `providers` siguen funcionando: repetir
 * el provider es idempotente.
 */
@NgModule({ providers: [provideZonelessChangeDetection()] })
class SynergosTestModule {}

getTestBed().initTestEnvironment([BrowserTestingModule, SynergosTestModule], platformBrowserTesting(), {
  // Un spec que deja el DOM sucio no puede contaminar al siguiente. Con 240
  // ficheros, un fallo que depende del orden de ejecución es de los que se
  // "arreglan" reordenando y vuelven un mes después.
  teardown: { destroyAfterEach: true },
});
