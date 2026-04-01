import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MediaExplorerComponent } from './interface/media-explorer';
import { MediaState } from './application/media.state';
import {
  selectMedia,
  activatePlayer,
  loadItems,
  filterByCategory,
} from './application/use-cases/select-media';
import { parseMediaItems } from './infrastructure/media-explorer.adapter';
import type { MediaItem } from './domain/models/media-item.model';

const SAMPLE_ITEMS: MediaItem[] = [
  {
    id: 'demo-1',
    title: 'Demo Synergos — Overview',
    description: 'Vista general del sistema.',
    videoUrl: 'https://www.youtube.com/embed/abc123',
    thumbnailSrc: '',
    thumbnailAlt: 'Overview thumbnail',
    tags: ['overview', 'intro'],
    duration: '3:45',
    category: 'Demo',
  },
  {
    id: 'demo-2',
    title: 'Cómo funciona el CMS',
    description: 'Integración con Umbraco.',
    videoUrl: 'https://www.youtube.com/embed/xyz789',
    thumbnailSrc: '',
    thumbnailAlt: 'CMS thumbnail',
    tags: ['cms', 'umbraco'],
    duration: '5:20',
    category: 'Tutorial',
  },
  {
    id: 'demo-3',
    title: 'Design System en acción',
    description: 'Tokens y componentes.',
    videoUrl: '',
    thumbnailSrc: '',
    thumbnailAlt: '',
    tags: ['design', 'tokens'],
    duration: '2:10',
    category: 'Demo',
  },
];

describe('MediaExplorerComponent', () => {
  let fixture: ComponentFixture<MediaExplorerComponent>;
  let component: MediaExplorerComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MediaExplorerComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(MediaExplorerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show empty state when no items provided', async () => {
    await fixture.whenStable();
    const empty = fixture.nativeElement.querySelector('.media-explorer__empty');
    expect(empty).toBeTruthy();
  });

  it('should render items in sidebar when items input is provided', async () => {
    fixture.componentRef.setInput('items', JSON.stringify(SAMPLE_ITEMS));
    fixture.detectChanges();
    await fixture.whenStable();

    const itemEls = fixture.nativeElement.querySelectorAll('.media-explorer__item');
    expect(itemEls.length).toBe(SAMPLE_ITEMS.length);
  });

  it('should show first item as selected after loading', async () => {
    fixture.componentRef.setInput('items', JSON.stringify(SAMPLE_ITEMS));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.selectedId()).toBe(SAMPLE_ITEMS[0].id);
  });

  it('should select a different item on click', async () => {
    fixture.componentRef.setInput('items', JSON.stringify(SAMPLE_ITEMS));
    fixture.detectChanges();
    await fixture.whenStable();

    const items = fixture.nativeElement.querySelectorAll('.media-explorer__item');
    items[1].click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.selectedId()).toBe(SAMPLE_ITEMS[1].id);
  });

  it('should show poster (not iframe) before play is activated', async () => {
    fixture.componentRef.setInput('items', JSON.stringify(SAMPLE_ITEMS));
    fixture.detectChanges();
    await fixture.whenStable();

    const iframe = fixture.nativeElement.querySelector('.media-explorer__iframe');
    const poster = fixture.nativeElement.querySelector('.media-explorer__poster');
    expect(iframe).toBeNull();
    expect(poster).toBeTruthy();
  });

  it('should activate iframe on play button click', async () => {
    fixture.componentRef.setInput('items', JSON.stringify(SAMPLE_ITEMS));
    fixture.detectChanges();
    await fixture.whenStable();

    const playBtn = fixture.nativeElement.querySelector('.media-explorer__play-btn');
    playBtn?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.isPlayerActive()).toBe(true);
    const iframe = fixture.nativeElement.querySelector('.media-explorer__iframe');
    expect(iframe).toBeTruthy();
  });

  it('should reset player on item change', async () => {
    fixture.componentRef.setInput('items', JSON.stringify(SAMPLE_ITEMS));
    fixture.detectChanges();
    await fixture.whenStable();

    component.play();
    expect(component.isPlayerActive()).toBe(true);

    component.select(SAMPLE_ITEMS[1].id);
    expect(component.isPlayerActive()).toBe(false);
  });

  it('should render category filters when categories are present', async () => {
    fixture.componentRef.setInput('items', JSON.stringify(SAMPLE_ITEMS));
    fixture.componentRef.setInput('title', 'Demos');
    fixture.detectChanges();
    await fixture.whenStable();

    const filters = fixture.nativeElement.querySelectorAll('.media-explorer__filter');
    expect(filters.length).toBeGreaterThan(1);
  });

  it('should filter items by category', async () => {
    fixture.componentRef.setInput('items', JSON.stringify(SAMPLE_ITEMS));
    fixture.detectChanges();
    await fixture.whenStable();

    component.filter('Tutorial');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.items().length).toBe(1);
    expect(component.items()[0].id).toBe('demo-2');
  });

  it('should render title when provided', async () => {
    fixture.componentRef.setInput('title', 'Galería de demos');
    fixture.detectChanges();
    await fixture.whenStable();

    const title = fixture.nativeElement.querySelector('.media-explorer__title');
    expect(title?.textContent?.trim()).toBe('Galería de demos');
  });

  it('should apply dark theme modifier class by default', async () => {
    await fixture.whenStable();
    const el = fixture.nativeElement.querySelector('.media-explorer');
    expect(el?.className).toContain('sg-media-explorer--dark');
  });

  it('should apply elementId as id attribute', async () => {
    fixture.componentRef.setInput('elementId', 'demos-section');
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement.querySelector('.media-explorer');
    expect(el?.getAttribute('id')).toBe('demos-section');
  });
});

describe('MediaState', () => {
  let state: MediaState;

  beforeEach(() => {
    state = new MediaState();
  });

  it('should initialize as empty', () => {
    expect(state.isEmpty()).toBe(true);
    expect(state.selectedItem()).toBeNull();
  });

  it('should load items and select first', () => {
    loadItems(state, SAMPLE_ITEMS);
    expect(state.items().length).toBe(3);
    expect(state.selectedId()).toBe('demo-1');
  });

  it('should select item by id', () => {
    loadItems(state, SAMPLE_ITEMS);
    selectMedia(state, 'demo-2');
    expect(state.selectedId()).toBe('demo-2');
    expect(state.isPlayerActive()).toBe(false);
  });

  it('should activate player', () => {
    loadItems(state, SAMPLE_ITEMS);
    activatePlayer(state);
    expect(state.isPlayerActive()).toBe(true);
  });

  it('should reset player on item change', () => {
    loadItems(state, SAMPLE_ITEMS);
    activatePlayer(state);
    selectMedia(state, 'demo-2');
    expect(state.isPlayerActive()).toBe(false);
  });

  it('should filter by category', () => {
    loadItems(state, SAMPLE_ITEMS);
    filterByCategory(state, 'Demo');
    expect(state.filteredItems().length).toBe(2);
  });

  it('should clear filter', () => {
    loadItems(state, SAMPLE_ITEMS);
    filterByCategory(state, 'Tutorial');
    filterByCategory(state, '');
    expect(state.filteredItems().length).toBe(3);
  });
});

describe('parseMediaItems', () => {
  it('should return null for undefined', () => {
    expect(parseMediaItems(undefined)).toBeNull();
  });

  it('should return null for invalid JSON', () => {
    expect(parseMediaItems('bad-json')).toBeNull();
  });

  it('should return null for empty array', () => {
    expect(parseMediaItems('[]')).toBeNull();
  });

  it('should parse valid items', () => {
    const result = parseMediaItems(JSON.stringify(SAMPLE_ITEMS));
    expect(result).not.toBeNull();
    expect(result!.length).toBe(3);
    expect(result![0].id).toBe('demo-1');
  });
});
