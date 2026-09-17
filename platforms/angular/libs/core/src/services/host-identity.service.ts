import { Injectable, computed, inject, signal } from '@angular/core';
import { getBridge, getMember, hasAnyRole } from '@synergos/vitals-core';
import type { SynergosMemberBridge } from '@synergos/contracts';
import { PlatformService } from './platform.service';

/**
 * Quién es la persona que está mirando, según el host.
 *
 * El CMS inyecta `window.synergos.member` en cada página —antes de que hidraten
 * los bundles— con `{ key, displayName, email, roles }` del miembro autenticado.
 * Los helpers de `@synergos/core/bridge` saben leerlo desde siempre; lo que no
 * había era **quien los llamara** (defecto #17): `getMember()` y `hasAnyRole()`
 * tenían cero consumidores, así que un miembro autenticado se veía anónimo para
 * todos los web components.
 *
 * Este servicio es ese consumidor, y es uno solo a propósito: con tres apps
 * pidiendo lo mismo el día uno, cada una leyendo el bridge por su cuenta habría
 * sido la cuarta arquitectura de lo mismo — que es exactamente cómo el catálogo
 * de shells acabó con cinco formas de montar una consola.
 *
 * **Se lee UNA vez.** El bridge lo emite el servidor por render, así que no
 * cambia mientras la página vive: un `signal` que nadie reescribe modela eso
 * mejor que releer `window` en cada acceso. Si la sesión cambia, cambia la
 * página.
 *
 * **Null-graceful por contrato.** Sin host —standalone, tests, SSR— todo
 * devuelve el valor de anónimo y nada falla. Es la propiedad que hace que los
 * elementos se puedan montar fuera del CMS, y no se negocia.
 */
@Injectable({ providedIn: 'root' })
export class HostIdentityService {
  readonly #platform = inject(PlatformService);

  /** Instantánea del miembro al construir. `null` = anónimo o sin host. */
  readonly #member = signal<SynergosMemberBridge | null>(
    this.#platform.runInBrowser(() => getMember(), null) ?? null,
  );

  /**
   * ¿Hay un host detrás? Es la distinción que no se puede sacar de `member`:
   * `null` significa las **dos** cosas —«el CMS dice que nadie inició sesión» y
   * «no hay CMS»— y para una superficie con permisos son opuestas. Sin host, un
   * elemento montado en standalone tiene que seguir comportándose como siempre;
   * con host, la ausencia de miembro sí quiere decir «hay que entrar».
   */
  readonly #hasHost = signal<boolean>(
    this.#platform.runInBrowser(() => getBridge() !== null, false) ?? false,
  );

  /** El miembro autenticado, o `null`. */
  readonly member = this.#member.asReadonly();

  /** Hay un `window.synergos` detrás. Ver `#hasHost`. */
  hasHost(): boolean {
    return this.#hasHost();
  }

  /** Hay sesión. */
  readonly isAuthenticated = computed(() => this.#member() !== null);

  /** Nombre para saludar y para prellenar. Cadena vacía si es anónimo. */
  readonly displayName = computed(() => this.#member()?.displayName ?? '');

  /** Correo del miembro. Cadena vacía si es anónimo. */
  readonly email = computed(() => this.#member()?.email ?? '');

  /** Identificador opaco del miembro. Cadena vacía si es anónimo. */
  readonly key = computed(() => this.#member()?.key ?? '');

  /**
   * ¿Tiene al menos uno de estos roles? Case-insensitive, `false` si es anónimo.
   *
   * Es para **ofrecer o no ofrecer** una superficie —la consola del instructor,
   * la cola del funcionario—, no para autorizar: quien autoriza es el backend, y
   * un 403 suyo sigue siendo la última palabra. Saberlo antes evita que la
   * persona pida algo para enterarse de que no podía.
   */
  hasAnyRole(...roles: string[]): boolean {
    if (this.#member() === null) {
      return false;
    }
    return this.#platform.runInBrowser(() => hasAnyRole(...roles), false) ?? false;
  }
}
