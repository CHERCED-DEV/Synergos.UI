<svelte:options customElement="synergos-accordion" />

<script lang="ts">
  let {
    heading = '',
    body = '',
    icon = '▸',
    variant = 'default',
    theme = 'light',
  }: {
    heading?: string;
    body?: string;
    icon?: string;
    variant?: string;
    theme?: string;
  } = $props();

  let open = $state(false);

  function toggle() {
    open = !open;
  }

  const rootClass = $derived(
    [
      'sg-accordion',
      open && 'sg-accordion--open',
      variant !== 'default' && `sg-accordion--${variant}`,
      theme === 'dark' && 'sg-accordion--dark',
    ]
      .filter(Boolean)
      .join(' ')
  );
</script>

<div class={rootClass}>
  <button
    class="sg-accordion__trigger"
    onclick={toggle}
    aria-expanded={open}
    type="button"
  >
    <span class="sg-accordion__heading">{heading}</span>
    <span class="sg-accordion__icon">{icon}</span>
  </button>

  {#if open}
    <div class="sg-accordion__panel" role="region">
      <p class="sg-accordion__body">{body}</p>
    </div>
  {/if}
</div>

<style>
  .sg-accordion {
    font-family: 'Manrope', 'Segoe UI', sans-serif;
    border: 1px solid #e2e8f0;
    border-radius: 0.5rem;
    overflow: hidden;
    background: #ffffff;
    color: #0f172a;
  }

  .sg-accordion--bordered {
    border-width: 2px;
  }

  .sg-accordion--dark {
    background: #1e293b;
    color: #f8fafc;
    border-color: #334155;
  }

  .sg-accordion__trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 1rem 1.25rem;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 600;
    font-family: inherit;
    text-align: left;
    transition: background 0.15s ease;
  }

  .sg-accordion__trigger:hover {
    background: #f8fafc;
  }

  .sg-accordion--dark .sg-accordion__trigger:hover {
    background: #334155;
  }

  .sg-accordion__heading {
    flex: 1;
  }

  .sg-accordion__icon {
    font-size: 0.875rem;
    transition: transform 0.2s ease;
    flex-shrink: 0;
    margin-left: 0.75rem;
  }

  .sg-accordion--open .sg-accordion__icon {
    transform: rotate(90deg);
  }

  .sg-accordion__panel {
    padding: 0 1.25rem 1rem;
  }

  .sg-accordion__body {
    font-size: 0.875rem;
    line-height: 1.625;
    color: #64748b;
    margin: 0;
  }

  .sg-accordion--dark .sg-accordion__body {
    color: #94a3b8;
  }
</style>
