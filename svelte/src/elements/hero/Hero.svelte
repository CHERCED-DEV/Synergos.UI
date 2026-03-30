<svelte:options customElement="synergos-hero" />

<script lang="ts">
  let {
    'heading-text': headingText = '',
    'heading-level': headingLevel = 'h1',
    body = '',
    'image-src': imageSrc = '',
    'image-alt': imageAlt = '',
    'cta-label': ctaLabel = '',
    'cta-url': ctaUrl = '',
    'cta-target': ctaTarget = '_self',
    variant = 'default',
    theme = 'light',
  }: Record<string, string> = $props();

  let hasImage = $derived(!!imageSrc);
  let hasCta = $derived(!!ctaLabel && !!ctaUrl);
  let hostClasses = $derived(`hero sg-hero--${variant} sg-hero--${theme}`);
</script>

<section
  class={hostClasses}
  style:background-image={hasImage ? `url(${imageSrc})` : undefined}
>
  <div class="hero__content">
    {#if headingText}
      {#if headingLevel === 'h2'}
        <h2 class="hero__heading">{headingText}</h2>
      {:else if headingLevel === 'h3'}
        <h3 class="hero__heading">{headingText}</h3>
      {:else}
        <h1 class="hero__heading">{headingText}</h1>
      {/if}
    {/if}

    {#if body}
      <p class="hero__body">{body}</p>
    {/if}

    {#if hasCta}
      <a class="hero__cta-link" href={ctaUrl} target={ctaTarget} rel="noopener noreferrer">
        <button class="syn-button syn-button--solid syn-button--lg">{ctaLabel}</button>
      </a>
    {/if}
  </div>
</section>

<style>
  .hero {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 25rem;
    padding: 3rem 2rem;
    background-color: #ffffff;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    border-radius: 0.5rem;
    position: relative;
  }

  :host(.sg-hero--dark), .sg-hero--dark {
    background-color: #111827;
    color: #ffffff;
  }

  .hero__content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    text-align: center;
    max-width: 45rem;
    position: relative;
    z-index: 1;
  }

  .hero__heading {
    margin: 0;
    font-size: 2.5rem;
    font-weight: 700;
    line-height: 1.2;
    color: #111827;
  }

  .sg-hero--dark .hero__heading { color: #ffffff; }

  .hero__body {
    margin: 0;
    font-size: 1.125rem;
    color: #6b7280;
    line-height: 1.75;
  }

  .sg-hero--dark .hero__body { color: #d1d5db; }

  .hero__cta-link { text-decoration: none; }

  .syn-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 0.375rem;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .syn-button--solid {
    background-color: #2563eb;
    color: #ffffff;
  }

  .syn-button--solid:hover { background-color: #1d4ed8; }

  .syn-button--lg {
    padding: 0.75rem 1.5rem;
    font-size: 1.125rem;
  }
</style>
