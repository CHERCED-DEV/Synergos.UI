import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  FileUploaderElementComponent,
  type FilesChangeDetail,
  formatFileSize,
  matchesAccept,
} from './file-uploader';

function makeFile(name: string, sizeBytes: number, type = 'text/plain'): File {
  const file = new File(['x'], name, { type });
  // jsdom builds File.size from the blob; override for deterministic sizing.
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

function makeFileList(files: readonly File[]): FileList {
  const list: Record<number, File> & { length: number; item(i: number): File | null } = {
    length: files.length,
    item: (index: number) => files[index] ?? null,
  };
  files.forEach((file, index) => {
    list[index] = file;
  });
  return list as unknown as FileList;
}

describe('FileUploaderElementComponent', () => {
  let fixture: ComponentFixture<FileUploaderElementComponent>;
  let component: FileUploaderElementComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FileUploaderElementComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(FileUploaderElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with no files and sensible defaults (empty case)', () => {
    expect(component).toBeTruthy();
    expect(component.hasFiles()).toBe(false);
    expect(component.files()).toEqual([]);
    expect(component.canAddMore()).toBe(true);
    expect(component.maxFiles()).toBe(10);
    expect(component.maxFileSizeMb()).toBe(10);
    expect(component.label()).toContain('Arrastra');
  });

  it('should resolve label/limits from config and accepts a file (render/config case)', async () => {
    fixture.componentRef.setInput('label', 'Sube tu CV');
    fixture.componentRef.setInput('maxFiles', '2');
    fixture.componentRef.setInput('maxFileSizeMb', '1');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.label()).toBe('Sube tu CV');
    expect(component.maxFiles()).toBe(2);
    expect(component.maxFileSizeMb()).toBe(1);

    // No endpoint configured → file resolves to 'done' locally.
    component.addFiles(makeFileList([makeFile('cv.pdf', 1000)]));
    fixture.detectChanges();

    expect(component.files().length).toBe(1);
    expect(component.files()[0].name).toBe('cv.pdf');
    expect(component.files()[0].status).toBe('done');
  });

  it('should reject oversize files, remove files, and emit fileschange (interaction case)', () => {
    fixture.componentRef.setInput('maxFileSizeMb', '1');
    fixture.detectChanges();

    let emitted: FilesChangeDetail | undefined;
    component.fileschange.subscribe((detail) => (emitted = detail));

    // 2 MB file over the 1 MB cap is rejected; a 0.5 MB file is accepted.
    component.addFiles(
      makeFileList([makeFile('big.bin', 2 * 1024 * 1024), makeFile('ok.txt', 512 * 1024)]),
    );

    expect(component.files().length).toBe(1);
    expect(component.files()[0].name).toBe('ok.txt');
    expect(component.rejection()).toContain('1 MB');
    expect(emitted?.files.length).toBe(1);

    component.removeFile(component.files()[0].id);
    expect(component.files()).toEqual([]);
    expect(emitted?.files.length).toBe(0);
  });

  it('should let direct inputs override config (idempotent precedence)', async () => {
    fixture.componentRef.setInput('config', '{"label":"Config label","maxFiles":3}');
    fixture.componentRef.setInput('label', 'Input label');
    fixture.detectChanges();
    await fixture.whenStable();

    // Direct input wins for label; config supplies maxFiles.
    expect(component.label()).toBe('Input label');
    expect(component.maxFiles()).toBe(3);

    // Re-applying the same inputs yields the same resolved state (idempotent).
    fixture.componentRef.setInput('label', 'Input label');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.label()).toBe('Input label');
    expect(component.maxFiles()).toBe(3);
  });
});

describe('file-uploader pure helpers', () => {
  it('formatFileSize renders human-readable sizes', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });

  it('matchesAccept honors extensions, mime and wildcards', () => {
    const pdf = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
    const png = new File(['x'], 'img.png', { type: 'image/png' });

    expect(matchesAccept(pdf, '')).toBe(true);
    expect(matchesAccept(pdf, '.pdf')).toBe(true);
    expect(matchesAccept(pdf, 'image/*')).toBe(false);
    expect(matchesAccept(png, 'image/*')).toBe(true);
    expect(matchesAccept(png, 'image/png')).toBe(true);
    expect(matchesAccept(png, '.jpg,.gif')).toBe(false);
  });
});
