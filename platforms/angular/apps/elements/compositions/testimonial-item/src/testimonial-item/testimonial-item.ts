import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { TestimonialItemElementConfig } from '@synergos/contracts';
import { AvatarComponent, coerceConfigInput, resolveConfigValue } from '@synergos/shared';

@Component({
  selector: 'sg-testimonial-item',
  imports: [AvatarComponent],
  templateUrl: './testimonial-item.html',
  styleUrl: './testimonial-item.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-testimonial-item' },
})
export class TestimonialItemElementComponent {
  readonly config = input<Partial<TestimonialItemElementConfig> | undefined, unknown>(undefined, {
    transform: coerceConfigInput<TestimonialItemElementConfig>,
  });
  readonly quoteInput = input<string | undefined>(undefined, { alias: 'quote' });
  readonly nameInput = input<string | undefined>(undefined, { alias: 'name' });
  readonly roleInput = input<string | undefined>(undefined, { alias: 'role' });
  readonly avatarSrcInput = input<string | undefined>(undefined, { alias: 'avatarSrc' });
  readonly avatarAltInput = input<string | undefined>(undefined, { alias: 'avatarAlt' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly quote = computed(() =>
    resolveConfigValue(this.quoteInput(), this.config()?.quote, ''),
  );
  readonly name = computed(() =>
    resolveConfigValue(this.nameInput(), this.config()?.name, ''),
  );
  readonly role = computed(() =>
    resolveConfigValue(this.roleInput(), this.config()?.role, ''),
  );
  readonly avatarSrc = computed(() =>
    resolveConfigValue(this.avatarSrcInput(), this.config()?.avatarSrc, ''),
  );
  readonly avatarAlt = computed(() =>
    resolveConfigValue(this.avatarAltInput(), this.config()?.avatarAlt, ''),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.config()?.theme, 'light'),
  );
  readonly hasMeta = computed(() => this.name().trim().length > 0 || this.role().trim().length > 0);
  readonly resolvedAvatarAlt = computed(() => {
    const avatarAlt = this.avatarAlt().trim();
    if (avatarAlt) {
      return avatarAlt;
    }

    const name = this.name().trim();
    return name ? `${name} avatar` : 'Testimonial avatar';
  });
  readonly hostClasses = computed(() => `testimonial-item--${this.theme()}`);
}
