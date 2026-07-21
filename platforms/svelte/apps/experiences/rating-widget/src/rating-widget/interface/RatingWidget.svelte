<svelte:options customElement="synergos-rating-widget" />

<script lang="ts">
  import { createLogger } from '@synergos/core';
  import { adaptRatingConfig } from '../infrastructure/rating.adapter';
  import { getRatingDescription } from '../application/rating.logic';
  import type { RatingConfig } from '../infrastructure/rating.config';

  let { config = '' }: { config?: string } = $props();

  const logger = createLogger('rating-widget');

  const instance = $derived.by(() => {
    try {
      const raw: Partial<RatingConfig> = config ? JSON.parse(config) : {};
      return adaptRatingConfig(raw);
    } catch {
      logger.warn('Invalid config JSON');
      return adaptRatingConfig({});
    }
  });

  let hovered = $state(0);
  let selected = $state(0);
  let submitted = $state(false);

  const description = $derived(getRatingDescription(selected, instance.max));

  const rootClass = $derived(
    [
      'sg-rating-widget',
      instance.theme === 'dark' && 'sg-rating-widget--dark',
      submitted && 'sg-rating-widget--submitted',
    ]
      .filter(Boolean)
      .join(' ')
  );

  function select(value: number) {
    if (!submitted) selected = value;
  }

  function submit() {
    if (selected > 0 && !submitted) {
      submitted = true;
      logger.info('Rating submitted', { value: selected, max: instance.max });
    }
  }
</script>

<div class={rootClass}>
  {#if instance.title}
    <h2 class="sg-rating-widget__title">{instance.title}</h2>
  {/if}
  {#if instance.subtitle}
    <p class="sg-rating-widget__subtitle">{instance.subtitle}</p>
  {/if}

  <div class="sg-rating-widget__stars" aria-label="Rating selector">
    {#each instance.labels as label (label.value)}
      <button
        class={[
          'sg-rating-widget__star',
          label.value <= (hovered || selected) && 'sg-rating-widget__star--active',
        ]
          .filter(Boolean)
          .join(' ')}
        type="button"
        aria-label={`${label.value} - ${label.label}`}
        onmouseenter={() => { if (!submitted) hovered = label.value; }}
        onmouseleave={() => { hovered = 0; }}
        onclick={() => select(label.value)}
        disabled={submitted}
      >
        ★
      </button>
    {/each}
  </div>

  {#if description}
    <p class="sg-rating-widget__description">{description}</p>
  {/if}

  {#if !submitted && selected > 0}
    <button class="sg-rating-widget__submit" type="button" onclick={submit}>
      Enviar valoración
    </button>
  {/if}

  {#if submitted}
    <p class="sg-rating-widget__thanks">¡Gracias por tu valoración!</p>
  {/if}
</div>

<style>
  .sg-rating-widget {
    font-family: 'Manrope', 'Segoe UI', sans-serif;
    background: #ffffff;
    color: #0f172a;
    border: 1px solid #e2e8f0;
    border-radius: 0.75rem;
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    align-items: flex-start;
  }

  .sg-rating-widget--dark {
    background: #1e293b;
    color: #f8fafc;
    border-color: #334155;
  }

  .sg-rating-widget__title {
    font-size: 1.25rem;
    font-weight: 700;
    margin: 0;
    letter-spacing: -0.025em;
  }

  .sg-rating-widget__subtitle {
    font-size: 0.875rem;
    color: #64748b;
    margin: 0;
    line-height: 1.5;
  }

  .sg-rating-widget--dark .sg-rating-widget__subtitle {
    color: #94a3b8;
  }

  .sg-rating-widget__stars {
    display: flex;
    gap: 0.25rem;
  }

  .sg-rating-widget__star {
    background: none;
    border: none;
    font-size: 2rem;
    color: #cbd5e1;
    cursor: pointer;
    padding: 0.125rem;
    transition: color 0.1s ease, transform 0.1s ease;
    line-height: 1;
  }

  .sg-rating-widget__star--active {
    color: #f59e0b;
    transform: scale(1.1);
  }

  .sg-rating-widget__star:disabled {
    cursor: default;
  }

  .sg-rating-widget__description {
    font-size: 0.875rem;
    font-weight: 600;
    color: #f59e0b;
    margin: 0;
  }

  .sg-rating-widget__submit {
    padding: 0.625rem 1.25rem;
    background: #0ea5e9;
    color: #ffffff;
    border: none;
    border-radius: 0.375rem;
    font-weight: 600;
    font-size: 0.875rem;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .sg-rating-widget__submit:hover {
    background: #0284c7;
  }

  .sg-rating-widget__thanks {
    font-size: 0.875rem;
    font-weight: 600;
    color: #10b981;
    margin: 0;
  }
</style>
