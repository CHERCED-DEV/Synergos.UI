<svelte:options customElement="synergos-filter-board" />

<script lang="ts">
  import { createLogger } from '@synergos/core';
  import { adaptFilterConfig } from '../infrastructure/filter.adapter';
  import { getAllTags, filterByTag } from '../domain/filter.domain';
  import { countByTag } from '../application/filter.logic';
  import type { FilterConfig } from '../infrastructure/filter.config';

  let { config = '' }: { config?: string } = $props();

  const logger = createLogger('filter-board');

  const instance = $derived.by(() => {
    try {
      const raw: Partial<FilterConfig> = config ? JSON.parse(config) : {};
      return adaptFilterConfig(raw);
    } catch {
      logger.warn('Invalid config JSON');
      return adaptFilterConfig({});
    }
  });

  let activeTag = $state<string | null>(null);

  const allTags = $derived(getAllTags(instance.items));
  const filteredItems = $derived(filterByTag(instance.items, activeTag));

  const rootClass = $derived(
    ['sg-filter-board', instance.theme === 'dark' && 'sg-filter-board--dark']
      .filter(Boolean)
      .join(' ')
  );

  function selectTag(tag: string | null) {
    activeTag = tag;
    logger.debug('Filter changed', { tag });
  }
</script>

<section class={rootClass}>
  {#if instance.title}
    <h2 class="sg-filter-board__title">{instance.title}</h2>
  {/if}

  {#if allTags.length > 0}
    <div class="sg-filter-board__filters" role="group" aria-label="Filtros">
      <button
        class={['sg-filter-board__tag', activeTag === null && 'sg-filter-board__tag--active']
          .filter(Boolean)
          .join(' ')}
        type="button"
        onclick={() => selectTag(null)}
      >
        Todos ({instance.items.length})
      </button>
      {#each allTags as tag (tag)}
        <button
          class={['sg-filter-board__tag', activeTag === tag && 'sg-filter-board__tag--active']
            .filter(Boolean)
            .join(' ')}
          type="button"
          onclick={() => selectTag(tag)}
        >
          {tag} ({countByTag(instance.items, tag)})
        </button>
      {/each}
    </div>
  {/if}

  <div class="sg-filter-board__grid">
    {#each filteredItems as item (item.title)}
      <article class="sg-filter-board__card">
        <h3 class="sg-filter-board__card-title">{item.title}</h3>
        {#if item.body}
          <p class="sg-filter-board__card-body">{item.body}</p>
        {/if}
        {#if item.tags.length > 0}
          <div class="sg-filter-board__card-tags">
            {#each item.tags as tag (tag)}
              <span class="sg-filter-board__badge">{tag}</span>
            {/each}
          </div>
        {/if}
      </article>
    {/each}
  </div>
</section>

<style>
  .sg-filter-board {
    font-family: 'Manrope', 'Segoe UI', sans-serif;
    background: #ffffff;
    color: #0f172a;
    border-radius: 0.75rem;
    border: 1px solid #e2e8f0;
    padding: 2rem;
  }

  .sg-filter-board--dark {
    background: #1e293b;
    color: #f8fafc;
    border-color: #334155;
  }

  .sg-filter-board__title {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0 0 1.5rem;
    letter-spacing: -0.025em;
  }

  .sg-filter-board__filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }

  .sg-filter-board__tag {
    padding: 0.375rem 0.875rem;
    border: 1px solid #e2e8f0;
    border-radius: 9999px;
    background: transparent;
    color: inherit;
    font-size: 0.8125rem;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }

  .sg-filter-board__tag:hover {
    border-color: #0ea5e9;
    color: #0ea5e9;
  }

  .sg-filter-board__tag--active {
    background: #0ea5e9;
    border-color: #0ea5e9;
    color: #ffffff;
  }

  .sg-filter-board--dark .sg-filter-board__tag {
    border-color: #334155;
  }

  .sg-filter-board__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    gap: 1rem;
  }

  .sg-filter-board__card {
    border: 1px solid #e2e8f0;
    border-radius: 0.5rem;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: #f8fafc;
    transition: box-shadow 0.2s ease;
  }

  .sg-filter-board__card:hover {
    box-shadow: 0 0.25rem 0.75rem -0.125rem rgb(15 23 42 / 0.1);
  }

  .sg-filter-board--dark .sg-filter-board__card {
    background: #0f172a;
    border-color: #334155;
  }

  .sg-filter-board__card-title {
    font-size: 0.9375rem;
    font-weight: 600;
    margin: 0;
  }

  .sg-filter-board__card-body {
    font-size: 0.8125rem;
    color: #64748b;
    margin: 0;
    line-height: 1.5;
    flex: 1;
  }

  .sg-filter-board--dark .sg-filter-board__card-body {
    color: #94a3b8;
  }

  .sg-filter-board__card-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-top: 0.25rem;
  }

  .sg-filter-board__badge {
    padding: 0.125rem 0.5rem;
    background: #e0f2fe;
    color: #0369a1;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .sg-filter-board--dark .sg-filter-board__badge {
    background: #0c4a6e;
    color: #7dd3fc;
  }
</style>
