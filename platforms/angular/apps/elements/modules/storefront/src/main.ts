import { registrarElementoAngular } from '@synergos/core';
import { definirCoordinador } from '@synergos/vitals-core';
import { appConfig } from './app.config';
import { StorefrontElementComponent } from './storefront/storefront';

// El coordinador de la compra por la puerta (<synergos-flujo>, ADR 0140 F4) lo define el participante al
// cargar su bundle, y ANTES de registrarse: así ningún pedido llega antes que su oyente. Es idempotente (la
// primera definición gana). La vista lo coloca alrededor del elemento con `flujo="tienda.compra"`.
definirCoordinador();
registrarElementoAngular('synergos-storefront', StorefrontElementComponent, appConfig);
