import {
  DRAWING_IMAGE_ALLOW_IMAGE_LIST,
  getDrawingImageAllowSize,
} from "@univerjs/preset-sheets-drawing";
import {
  EventSubject,
  ImageSourceType,
  ImageUploadStatusType,
  fromEventSubject,
  type IImageIoService,
  type IImageIoServiceParam,
} from "@univerjs/presets";
import { nanoid } from "nanoid";

import { assetRepository } from "../db/repositories/asset.repository";

export class LocalImageIoService implements IImageIoService {
  private waitCount = 0;
  private readonly changeSubject = new EventSubject<number>();
  private readonly imageCache = new Map<string, HTMLImageElement>();
  private readonly objectUrls = new Map<string, string>();
  readonly change$ = fromEventSubject(this.changeSubject);

  constructor(private readonly workbookId: string) {}

  setWaitCount(count: number): void {
    this.waitCount = Math.max(0, count);
    this.changeSubject.emitEvent(this.waitCount);
  }

  getImageSourceCache(
    source: string,
    imageSourceType: ImageSourceType,
  ): HTMLImageElement | undefined {
    if (imageSourceType === ImageSourceType.BASE64) {
      const image = new Image();
      image.src = source;
      return image;
    }
    return this.imageCache.get(source);
  }

  addImageSourceCache(
    source: string,
    imageSourceType: ImageSourceType,
    imageSource: HTMLImageElement | null,
  ): void {
    if (imageSourceType === ImageSourceType.BASE64 || !imageSource) return;
    this.imageCache.set(source, imageSource);
  }

  async getImage(imageId: string): Promise<string> {
    const cachedUrl = this.objectUrls.get(imageId);
    if (cachedUrl) return cachedUrl;

    const asset = await assetRepository.get(imageId);
    if (!asset || asset.workbookId !== this.workbookId) {
      throw new Error("找不到工作簿中的本地图片。");
    }
    const objectUrl = URL.createObjectURL(asset.blob);
    this.objectUrls.set(imageId, objectUrl);
    return objectUrl;
  }

  async saveImage(imageFile: File): Promise<IImageIoServiceParam | null> {
    try {
      if (!DRAWING_IMAGE_ALLOW_IMAGE_LIST.includes(imageFile.type)) {
        throw new Error(ImageUploadStatusType.ERROR_IMAGE_TYPE);
      }
      if (imageFile.size > getDrawingImageAllowSize()) {
        throw new Error(ImageUploadStatusType.ERROR_EXCEED_SIZE);
      }

      const imageId = `asset_${nanoid(12)}`;
      await assetRepository.save({
        id: imageId,
        workbookId: this.workbookId,
        fileName: imageFile.name || "工作表图片",
        mimeType: imageFile.type,
        size: imageFile.size,
        blob: imageFile,
        createdAt: Date.now(),
      });
      const objectUrl = URL.createObjectURL(imageFile);
      this.objectUrls.set(imageId, objectUrl);
      return {
        imageId,
        imageSourceType: ImageSourceType.UUID,
        source: imageId,
        base64Cache: objectUrl,
        status: ImageUploadStatusType.SUCCUSS,
      };
    } finally {
      this.decreaseWaiting();
    }
  }

  dispose(): void {
    this.objectUrls.forEach((url) => URL.revokeObjectURL(url));
    this.objectUrls.clear();
    this.imageCache.clear();
    this.changeSubject.complete();
  }

  private decreaseWaiting(): void {
    this.waitCount = Math.max(0, this.waitCount - 1);
    this.changeSubject.emitEvent(this.waitCount);
  }
}
