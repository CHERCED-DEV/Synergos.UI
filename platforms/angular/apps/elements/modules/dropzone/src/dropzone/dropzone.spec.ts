import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  DropzoneElementComponent,
  formatFileSize,
  matchesAcceptedTypes,
  parseAcceptedTypes,
  type DropzoneSelectionDetail,
} from './dropzone';

function makeFile(name: string, type: string, sizeBytes: number): File {
  const blob = new Blob([new Uint8Array(Math.max(sizeBytes, 0))], { type });
  return new File([blob], name, { type });
}

function makeFileList(files: readonly File[]): FileList {
  const list: Record<number, File> & { length: number; item(index: number): File | null } = {
    length: files.length,
    item: (index: number) => files[index] ?? null,
  };
  files.forEach((file, index) => {
    list[index] = file;
  });
  return list as unknown as FileList;
}

describe('DropzoneElementComponent', () => {
  let fixture: ComponentFixture<DropzoneElementComponent>;
  let component: DropzoneElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DropzoneElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(DropzoneElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with no staged files and sensible defaults (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.files()).toEqual([]);
    expect(component.hasFiles()).toBe(false);
    expect(component.canUpload()).toBe(false);
    expect(component.statusMessage()).toContain('Sin archivos');
  });

  it('should resolve config and derive a hint (render + config case)', async () => {
    fixture.componentRef.setInput(
      'config',
      JSON.stringify({ acceptedTypes: '.png, image/jpeg', maxSizeMb: 2, multiple: false }),
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.acceptedTypes()).toEqual(['.png', 'image/jpeg']);
    expect(component.maxSizeMb()).toBe(2);
    expect(component.multiple()).toBe(false);
    expect(component.acceptAttr()).toBe('.png,image/jpeg');
    expect(component.hint()).toContain('máx.');
    expect(component.hint()).toContain('2 MB');
  });

  it('should accept valid files and reject by type and size (interaction case)', async () => {
    fixture.componentRef.setInput('acceptedTypes', 'image/*');
    fixture.componentRef.setInput('maxSizeMb', 1);
    fixture.detectChanges();
    await fixture.whenStable();

    let captured: DropzoneSelectionDetail | undefined;
    component.filesrejected.subscribe((detail) => (captured = detail));

    const ok = makeFile('photo.png', 'image/png', 1024);
    const wrongType = makeFile('notes.pdf', 'application/pdf', 1024);
    const tooBig = makeFile('huge.png', 'image/png', 2 * 1024 * 1024);

    const event = { target: { files: makeFileList([ok, wrongType, tooBig]), value: 'x' } } as unknown as Event;
    component.onFileInputChange(event);

    expect(component.files().length).toBe(1);
    expect(component.files()[0].name).toBe('photo.png');
    expect(component.files()[0].status).toBe('pending');
    expect(captured?.rejected.length).toBe(2);
    expect(captured?.rejected.map((rejection) => rejection.reason).sort()).toEqual(['size', 'type']);
  });

  it('should let direct inputs override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', JSON.stringify({ label: 'Config label', maxFiles: 3 }));
    fixture.componentRef.setInput('label', 'Input label');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.label()).toBe('Input label');
    // maxFiles only set via config, so it flows through.
    expect(component.maxFiles()).toBe(3);
  });

  describe('pure helpers', () => {
    it('formatFileSize scales bytes to human units', () => {
      expect(formatFileSize(0)).toBe('0 B');
      expect(formatFileSize(512)).toBe('512 B');
      expect(formatFileSize(2 * 1024 * 1024)).toContain('MB');
    });

    it('parseAcceptedTypes normalizes the accept list', () => {
      expect(parseAcceptedTypes(' .PNG , image/JPEG ,')).toEqual(['.png', 'image/jpeg']);
      expect(parseAcceptedTypes('')).toEqual([]);
    });

    it('matchesAcceptedTypes honors extensions, wildcards and exact MIME', () => {
      expect(matchesAcceptedTypes({ name: 'a.png', type: 'image/png' }, [])).toBe(true);
      expect(matchesAcceptedTypes({ name: 'a.png', type: 'image/png' }, ['.png'])).toBe(true);
      expect(matchesAcceptedTypes({ name: 'a.png', type: 'image/png' }, ['image/*'])).toBe(true);
      expect(matchesAcceptedTypes({ name: 'a.pdf', type: 'application/pdf' }, ['image/*'])).toBe(false);
    });
  });
});
