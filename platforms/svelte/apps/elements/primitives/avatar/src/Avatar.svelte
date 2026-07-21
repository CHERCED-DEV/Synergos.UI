<svelte:options customElement="synergos-avatar" />

<script lang="ts">
  let {
    src = '',
    alt = '',
    name = '',
    size = 'md',
    shape = 'circle',
    status = '',
    theme = 'light',
  }: {
    src?: string;
    alt?: string;
    name?: string;
    size?: string;
    shape?: string;
    status?: string;
    theme?: string;
  } = $props();

  let imgError = $state(false);

  const initials = $derived(
    name
      .split(' ')
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join('')
  );

  const showImage = $derived(src && !imgError);
  const hasStatus = $derived(!!status);

  const rootClass = $derived(
    [
      'sg-avatar',
      `sg-avatar--${size}`,
      `sg-avatar--${shape}`,
      theme === 'dark' && 'sg-avatar--dark',
    ]
      .filter(Boolean)
      .join(' ')
  );

  function handleError() {
    imgError = true;
  }
</script>

<div class={rootClass}>
  {#if showImage}
    <img
      class="sg-avatar__image"
      src={src}
      alt={alt || name}
      onerror={handleError}
    />
  {:else}
    <span class="sg-avatar__initials">{initials || '?'}</span>
  {/if}

  {#if hasStatus}
    <span class="sg-avatar__status sg-avatar__status--{status}"></span>
  {/if}
</div>

<style>
  .sg-avatar {
    font-family: 'Manrope', 'Segoe UI', sans-serif;
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: #e0f2fe;
    color: #0284c7;
    flex-shrink: 0;
  }

  .sg-avatar--dark {
    background: #334155;
    color: #7dd3fc;
  }

  /* Sizes */
  .sg-avatar--xs { width: 1.5rem;  height: 1.5rem;  font-size: 0.625rem; }
  .sg-avatar--sm { width: 2rem;    height: 2rem;    font-size: 0.75rem; }
  .sg-avatar--md { width: 2.5rem;  height: 2.5rem;  font-size: 0.875rem; }
  .sg-avatar--lg { width: 3.5rem;  height: 3.5rem;  font-size: 1.125rem; }
  .sg-avatar--xl { width: 5rem;    height: 5rem;    font-size: 1.5rem; }

  /* Shapes */
  .sg-avatar--circle { border-radius: 50%; }
  .sg-avatar--rounded { border-radius: 0.5rem; }
  .sg-avatar--square { border-radius: 0; }

  .sg-avatar__image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .sg-avatar__initials {
    font-weight: 600;
    letter-spacing: 0.025em;
    user-select: none;
  }

  /* Status indicator */
  .sg-avatar__status {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 25%;
    height: 25%;
    min-width: 0.5rem;
    min-height: 0.5rem;
    border-radius: 50%;
    border: 2px solid #ffffff;
  }

  .sg-avatar--dark .sg-avatar__status {
    border-color: #1e293b;
  }

  .sg-avatar__status--online  { background: #16a34a; }
  .sg-avatar__status--offline { background: #94a3b8; }
  .sg-avatar__status--busy    { background: #dc2626; }
  .sg-avatar__status--away    { background: #f59e0b; }
</style>
