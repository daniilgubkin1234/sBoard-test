import * as PIXI from 'pixi.js-legacy';
import { getTrackedCommands } from './pixi-tracker';
import type { TrackedGraphics, TrackedSprite } from './types';
import type { SkiaKit } from './skia-runtime';

export interface ViewportSize {
  width: number;
  height: number;
}

interface FillState {
  color: number;
  alpha: number;
}

interface StrokeState {
  width: number;
  color: number;
  alpha: number;
}

type SkSurfaceLike = any;
type SkCanvasLike = any;
type SkImageLike = any;
type SkPathLike = any;

function hexToColor(skia: SkiaKit, hex: number, alpha = 1) {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return skia.Color(r, g, b, alpha);
}

function toDomMatrix(matrix: PIXI.Matrix): DOMMatrix {
  return new DOMMatrix([matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty]);
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const [, base64 = ''] = dataUrl.split(',');
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export class SkiaRenderer {
  private readonly skia: SkiaKit;
  private readonly canvasElement: HTMLCanvasElement;
  private surface: SkSurfaceLike | null;
  private readonly imageCache: Map<string, SkImageLike>;

  constructor(skia: SkiaKit, canvasElement: HTMLCanvasElement) {
    this.skia = skia;
    this.canvasElement = canvasElement;
    this.surface = null;
    this.imageCache = new Map();
  }

  private ensureSurface(size: ViewportSize): void {
    if (this.canvasElement.width !== size.width) {
      this.canvasElement.width = size.width;
    }

    if (this.canvasElement.height !== size.height) {
      this.canvasElement.height = size.height;
    }

    if (!this.surface) {
      this.surface = this.skia.MakeSWCanvasSurface(this.canvasElement);
    }

    if (!this.surface) {
      throw new Error('Failed to create Skia preview surface');
    }
  }

  private getImage(sourceUrl: string): SkImageLike {
    const cached = this.imageCache.get(sourceUrl);
    if (cached) {
      return cached;
    }

    const image = this.skia.MakeImageFromEncoded(dataUrlToBytes(sourceUrl));
    if (!image) {
      throw new Error('Failed to decode sprite image for Skia');
    }

    this.imageCache.set(sourceUrl, image);
    return image;
  }

  private createPaint(style: FillState | StrokeState, mode: 'fill' | 'stroke') {
    const paint = new this.skia.Paint();
    paint.setAntiAlias(true);
    paint.setColor(hexToColor(this.skia, style.color, style.alpha));
    paint.setStyle(mode === 'fill' ? this.skia.PaintStyle.Fill : this.skia.PaintStyle.Stroke);

    if (mode === 'stroke') {
      const strokeStyle = style as StrokeState;
      paint.setStrokeWidth(strokeStyle.width);
      paint.setStrokeJoin(this.skia.StrokeJoin.Round);
      paint.setStrokeCap(this.skia.StrokeCap.Round);
    }

    return paint;
  }

  private drawGraphics(target: PIXI.Graphics, canvas: SkCanvasLike): void {
    const commands = getTrackedCommands(target as TrackedGraphics);
    if (commands.length === 0) {
      return;
    }

    let fillState: FillState | null = null;
    let strokeState: StrokeState | null = null;
    let polylinePath: SkPathLike | null = null;

    canvas.save();
    canvas.concat(toDomMatrix(target.worldTransform));

    const flushPolyline = () => {
      if (!polylinePath || !strokeState) {
        return;
      }

      const strokePaint = this.createPaint(strokeState, 'stroke');
      canvas.drawPath(polylinePath, strokePaint);
      strokePaint.delete();
      polylinePath.delete();
      polylinePath = null;
    };

    for (const command of commands) {
      switch (command.kind) {
        case 'beginFill':
          fillState = { color: command.color, alpha: command.alpha };
          break;
        case 'lineStyle':
          flushPolyline();
          strokeState = { width: command.width, color: command.color, alpha: command.alpha };
          break;
        case 'endFill':
          flushPolyline();
          fillState = null;
          break;
        case 'drawRect': {
          flushPolyline();
          const rect = this.skia.XYWHRect(command.x, command.y, command.width, command.height);

          if (fillState) {
            const fillPaint = this.createPaint(fillState, 'fill');
            canvas.drawRect(rect, fillPaint);
            fillPaint.delete();
          }

          if (strokeState && strokeState.width > 0) {
            const strokePaint = this.createPaint(strokeState, 'stroke');
            canvas.drawRect(rect, strokePaint);
            strokePaint.delete();
          }
          break;
        }
        case 'drawEllipse': {
          flushPolyline();
          const rect = this.skia.XYWHRect(
            command.x - command.radiusX,
            command.y - command.radiusY,
            command.radiusX * 2,
            command.radiusY * 2,
          );

          if (fillState) {
            const fillPaint = this.createPaint(fillState, 'fill');
            canvas.drawOval(rect, fillPaint);
            fillPaint.delete();
          }

          if (strokeState && strokeState.width > 0) {
            const strokePaint = this.createPaint(strokeState, 'stroke');
            canvas.drawOval(rect, strokePaint);
            strokePaint.delete();
          }
          break;
        }
        case 'moveTo':
          polylinePath ??= new this.skia.Path();
          polylinePath.moveTo(command.x, command.y);
          break;
        case 'lineTo':
          polylinePath ??= new this.skia.Path();
          polylinePath.lineTo(command.x, command.y);
          break;
      }
    }

    flushPolyline();
    canvas.restore();
  }

  private drawSprite(target: PIXI.Sprite, canvas: SkCanvasLike): void {
    const trackedSprite = target as TrackedSprite;
    if (!trackedSprite.__sboardSourceUrl) {
      return;
    }

    const image = this.getImage(trackedSprite.__sboardSourceUrl);
    const sourceRect = this.skia.XYWHRect(0, 0, image.width(), image.height());
    const destRect = this.skia.XYWHRect(
      -target.anchor.x * target.width,
      -target.anchor.y * target.height,
      target.width,
      target.height,
    );
    const paint = new this.skia.Paint();
    paint.setAntiAlias(true);

    canvas.save();
    canvas.concat(toDomMatrix(target.worldTransform));
    canvas.drawImageRect(image, sourceRect, destRect, paint, false);
    canvas.restore();

    paint.delete();
  }

  private drawNode(target: PIXI.DisplayObject, canvas: SkCanvasLike): void {
    if (!target.visible || target.worldAlpha <= 0) {
      return;
    }

    if (target instanceof PIXI.Graphics) {
      this.drawGraphics(target, canvas);
    } else if (target instanceof PIXI.Sprite) {
      this.drawSprite(target, canvas);
    }

    const maybeContainer = target as PIXI.Container;
    if ('children' in maybeContainer && Array.isArray(maybeContainer.children)) {
      for (const child of maybeContainer.children) {
        this.drawNode(child, canvas);
      }
    }
  }

  private renderToCanvas(targetRoot: PIXI.Container, canvas: SkCanvasLike, size: ViewportSize): void {
    canvas.clear(this.skia.Color(9, 14, 26, 1));

    const framePaint = new this.skia.Paint();
    framePaint.setAntiAlias(true);
    framePaint.setStyle(this.skia.PaintStyle.Stroke);
    framePaint.setStrokeWidth(2);
    framePaint.setColor(this.skia.Color(71, 85, 105, 0.65));
    canvas.drawRect(this.skia.XYWHRect(20, 20, size.width - 40, size.height - 40), framePaint);
    framePaint.delete();

    this.drawNode(targetRoot, canvas);
  }

  render(targetRoot: PIXI.Container, size: ViewportSize): void {
    this.ensureSurface(size);

    if (!this.surface) {
      return;
    }

    const canvas = this.surface.getCanvas();
    this.renderToCanvas(targetRoot, canvas, size);
    this.surface.flush();
  }

  exportPdf(targetRoot: PIXI.Container, size: ViewportSize): Blob {
    const document = this.skia.MakePDFDocument({
      title: 'Pixi to Skia PDF export',
      author: 'Daniil Gubkin',
      creator: 'sboard test task',
      producer: 'Skia PDF backend',
      language: 'ru-RU',
      rootTag: {
        type: 'Document',
        language: 'ru-RU',
        children: [],
      },
    });
    const pageCanvas = document.beginPage(size.width, size.height);

    this.renderToCanvas(targetRoot, pageCanvas, size);
    document.endPage();

    const bytes = new Uint8Array(document.close());
    document.delete();

    return new Blob([bytes.buffer], { type: 'application/pdf' });
  }

  dispose(): void {
    this.surface?.dispose();
    this.surface = null;

    for (const image of this.imageCache.values()) {
      image?.delete();
    }

    this.imageCache.clear();
  }
}
