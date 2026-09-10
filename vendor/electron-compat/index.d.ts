/**
 * electron 자리 패키지 타입 선언.
 *
 * src/main/services/allowance-document-pdf-service.ts 가 실제로 쓰는 모양만 담는다.
 * 이 파일을 줄이면 그 파일의 타입검사가 TS2339 로 깨진다.
 *
 * Phase 1 은 PDF 지원 안 함 · 2.5-5. PDF 흡수 에서 대체(R-15).
 */

/** nativeImage.getSize() 의 반환 모양 (pdf-service 461행: const { width, height } = image.getSize()). */
export interface NativeImageSize {
  width: number;
  height: number;
}

/** nativeImage.createFromPath() · createFromBitmap() 이 돌려주는 이미지. */
export interface NativeImage {
  /** pdf-service 457행: if (image.isEmpty()) */
  isEmpty(): boolean;
  /** pdf-service 461행: const { width, height } = image.getSize() */
  getSize(): NativeImageSize;
  /** pdf-service 462행: Buffer.from(image.toBitmap()) */
  toBitmap(): Buffer;
  /** pdf-service 465행: return image.toPNG() · 523행: ...createFromBitmap(...).toPNG() */
  toPNG(): Buffer;
}

/** pdf-service 523행: createFromBitmap(bitmap, { height, scaleFactor: 1, width }) */
export interface NativeImageBitmapOptions {
  width: number;
  height: number;
  scaleFactor?: number;
}

/** pdf-service 4행: import { nativeImage } from "electron" */
export const nativeImage: {
  /** pdf-service 455행: nativeImage.createFromPath(logoPath) */
  createFromPath(path: string): NativeImage;
  /** pdf-service 523행: nativeImage.createFromBitmap(bitmap, { height, scaleFactor: 1, width }) */
  createFromBitmap(buffer: Buffer, options: NativeImageBitmapOptions): NativeImage;
};

/** pdf-service 856~858행: webPreferences 안의 contextIsolation · nodeIntegration · sandbox */
export interface BrowserWindowWebPreferences {
  contextIsolation?: boolean;
  nodeIntegration?: boolean;
  sandbox?: boolean;
}

/** pdf-service 851~860행: new BrowserWindow({ show, width, height, webPreferences }) */
export interface BrowserWindowConstructorOptions {
  show?: boolean;
  width?: number;
  height?: number;
  webPreferences?: BrowserWindowWebPreferences;
}

/** pdf-service 870~872행: printToPDF 인자의 landscape · printBackground · preferCSSPageSize */
export interface PrintToPdfOptions {
  landscape?: boolean;
  printBackground?: boolean;
  preferCSSPageSize?: boolean;
}

/** pdf-service 869행: browserWindow.webContents.printToPDF(...) */
export interface WebContents {
  printToPDF(options: PrintToPdfOptions): Promise<Buffer>;
}

/** pdf-service 850행: const { BrowserWindow } = await import("electron") */
export class BrowserWindow {
  /** pdf-service 851행: new BrowserWindow({ ... }) */
  constructor(options?: BrowserWindowConstructorOptions);
  /** pdf-service 869행: browserWindow.webContents.printToPDF(...) */
  readonly webContents: WebContents;
  /** pdf-service 866행: await browserWindow.loadFile(tempHtmlPath) */
  loadFile(filePath: string): Promise<void>;
  /** pdf-service 883행: if (!browserWindow.isDestroyed()) */
  isDestroyed(): boolean;
  /** pdf-service 884행: browserWindow.destroy() */
  destroy(): void;
}
