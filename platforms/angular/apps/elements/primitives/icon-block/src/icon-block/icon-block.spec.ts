import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { IconBlockComponent } from './icon-block';

describe('IconBlockComponent', () => {
  let fixture: ComponentFixture<IconBlockComponent>;
  let component: IconBlockComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IconBlockComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(IconBlockComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should be decorative by default (role=presentation, aria-hidden=true)', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const span = fixture.nativeElement.querySelector('.icon-block');
    expect(span?.getAttribute('role')).toBe('presentation');
    expect(span?.getAttribute('aria-hidden')).toBe('true');
    expect(span?.getAttribute('aria-label')).toBeNull();
  });

  it('should be semantic when ariaHidden is false (role=img)', async () => {
    fixture.componentRef.setInput('ariaHidden', false);
    fixture.componentRef.setInput('ariaLabel', 'Star rating');
    fixture.detectChanges();
    await fixture.whenStable();

    const span = fixture.nativeElement.querySelector('.icon-block');
    expect(span?.getAttribute('role')).toBe('img');
    expect(span?.getAttribute('aria-hidden')).toBeNull();
    expect(span?.getAttribute('aria-label')).toBe('Star rating');
  });

  it('should fall back to icon name as aria-label when ariaLabel is empty but ariaHidden is false', async () => {
    fixture.componentRef.setInput('ariaHidden', false);
    fixture.componentRef.setInput('icon', 'icon-star');
    fixture.detectChanges();
    await fixture.whenStable();

    const span = fixture.nativeElement.querySelector('.icon-block');
    expect(span?.getAttribute('aria-label')).toBe('icon-star');
  });

  it('should apply size modifier class', async () => {
    fixture.componentRef.setInput('size', 'lg');
    fixture.detectChanges();
    await fixture.whenStable();

    const span = fixture.nativeElement.querySelector('.icon-block');
    expect(span?.className).toContain('sg-icon-block--lg');
  });

  it('should apply color as inline style', async () => {
    fixture.componentRef.setInput('color', '#ff6600');
    fixture.detectChanges();
    await fixture.whenStable();

    const span = fixture.nativeElement.querySelector('.icon-block');
    expect(span?.style.color).toBe('rgb(255, 102, 0)');
  });

  it('should not set color style when color is empty', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const span = fixture.nativeElement.querySelector('.icon-block');
    expect(span?.style.color).toBe('');
  });

  it('should render icon class on inner element', async () => {
    fixture.componentRef.setInput('icon', 'icon-check');
    fixture.detectChanges();
    await fixture.whenStable();

    const icon = fixture.nativeElement.querySelector('.icon-block__icon');
    expect(icon?.className).toContain('icon-check');
  });

  it('should parse config attribute and apply values', async () => {
    fixture.componentRef.setInput(
      'config',
      '{"icon":"icon-bolt","size":"xl","color":"#0055ff","ariaHidden":false,"ariaLabel":"Lightning bolt"}',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.icon()).toBe('icon-bolt');
    expect(component.size()).toBe('xl');
    expect(component.ariaHidden()).toBe(false);
    expect(component.ariaLabel()).toBe('Lightning bolt');
  });
});
