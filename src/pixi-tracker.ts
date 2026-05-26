import * as PIXI from 'pixi.js-legacy';
import type { GraphicsCommand, PointerDispatchPayload, TrackedGraphics, TrackedSprite } from './types';

let isInstrumented = false;

const DEFAULT_FILL_ALPHA = 1;
const DEFAULT_STROKE_ALPHA = 1;

function normalizeColor(input: unknown): number {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return input >>> 0;
  }

  if (typeof input === 'string') {
    const hex = input.trim().replace('#', '');
    const parsed = Number.parseInt(hex, 16);
    return Number.isFinite(parsed) ? parsed >>> 0 : 0;
  }

  return 0;
}

function ensureCommandStore(graphics: PIXI.Graphics): GraphicsCommand[] {
  const tracked = graphics as TrackedGraphics;
  tracked.__sboardCommands ??= [];
  return tracked.__sboardCommands;
}

function pushCommand(graphics: PIXI.Graphics, command: GraphicsCommand): void {
  ensureCommandStore(graphics).push(command);
}

export function instrumentPixiGraphics(): void {
  if (isInstrumented) {
    return;
  }

  isInstrumented = true;

  const graphicsProto = PIXI.Graphics.prototype as any;

  const originalBeginFill = graphicsProto.beginFill;
  graphicsProto.beginFill = function beginFillPatched(color?: unknown, alpha = DEFAULT_FILL_ALPHA) {
    pushCommand(this, {
      kind: 'beginFill',
      color: normalizeColor(color),
      alpha: typeof alpha === 'number' ? alpha : DEFAULT_FILL_ALPHA,
    });
    return originalBeginFill.call(this, color as never, alpha);
  };

  const originalEndFill = graphicsProto.endFill;
  graphicsProto.endFill = function endFillPatched() {
    pushCommand(this, { kind: 'endFill' });
    return originalEndFill.call(this);
  };

  const originalDrawRect = graphicsProto.drawRect;
  graphicsProto.drawRect = function drawRectPatched(x: number, y: number, width: number, height: number) {
    pushCommand(this, { kind: 'drawRect', x, y, width, height });
    return originalDrawRect.call(this, x, y, width, height);
  };

  const originalDrawEllipse = graphicsProto.drawEllipse;
  graphicsProto.drawEllipse = function drawEllipsePatched(x: number, y: number, width: number, height: number) {
    pushCommand(this, { kind: 'drawEllipse', x, y, radiusX: width, radiusY: height });
    return originalDrawEllipse.call(this, x, y, width, height);
  };

  const originalDrawShape = graphicsProto.drawShape;
  graphicsProto.drawShape = function drawShapePatched(shape: unknown) {
    if (shape instanceof PIXI.Rectangle) {
      pushCommand(this, {
        kind: 'drawRect',
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height,
      });
    }

    if (shape instanceof PIXI.Ellipse) {
      pushCommand(this, {
        kind: 'drawEllipse',
        x: shape.x,
        y: shape.y,
        radiusX: shape.width,
        radiusY: shape.height,
      });
    }

    return originalDrawShape.call(this, shape as never);
  };

  const originalMoveTo = graphicsProto.moveTo;
  graphicsProto.moveTo = function moveToPatched(x: number, y: number) {
    pushCommand(this, { kind: 'moveTo', x, y });
    return originalMoveTo.call(this, x, y);
  };

  const originalLineTo = graphicsProto.lineTo;
  graphicsProto.lineTo = function lineToPatched(x: number, y: number) {
    pushCommand(this, { kind: 'lineTo', x, y });
    return originalLineTo.call(this, x, y);
  };

  const originalLineStyle = graphicsProto.lineStyle;
  graphicsProto.lineStyle = function lineStylePatched(
    widthOrOptions?: number | PIXI.ILineStyleOptions,
    color?: PIXI.ColorSource,
    alpha?: number,
  ) {
    const options =
      typeof widthOrOptions === 'object' && widthOrOptions !== null
        ? widthOrOptions
        : {
            width: typeof widthOrOptions === 'number' ? widthOrOptions : 0,
            color,
            alpha,
          };

    pushCommand(this, {
      kind: 'lineStyle',
      width: options.width ?? 0,
      color: normalizeColor(options.color),
      alpha: options.alpha ?? DEFAULT_STROKE_ALPHA,
    });

    return originalLineStyle.call(this, widthOrOptions as never, color as never, alpha);
  };
}

export function createTrackedGraphics(name: string): TrackedGraphics {
  const graphics = new PIXI.Graphics() as TrackedGraphics;
  graphics.__sboardName = name;
  graphics.__sboardCommands = [];
  return graphics;
}

export function createTrackedSprite(texture: PIXI.Texture, sourceUrl: string, name: string): TrackedSprite {
  const sprite = new PIXI.Sprite(texture) as TrackedSprite;
  sprite.__sboardSourceUrl = sourceUrl;
  sprite.__sboardName = name;
  return sprite;
}

export function getTrackedCommands(displayObject: PIXI.DisplayObject): GraphicsCommand[] {
  return (displayObject as TrackedGraphics).__sboardCommands ?? [];
}

export function getDisplayName(displayObject: PIXI.DisplayObject): string {
  return (displayObject as TrackedGraphics).__sboardName ?? displayObject.name ?? displayObject.constructor.name;
}

export function bindDebugPointerLogs(
  displayObject: PIXI.DisplayObject,
  logger: (message: string) => void,
): void {
  const name = getDisplayName(displayObject);

  displayObject.on('pointerdown', ((payload: PointerDispatchPayload) => {
    logger(`${payload.sourceCanvas}: ${name} -> pointerdown @ (${payload.x.toFixed(0)}, ${payload.y.toFixed(0)})`);
  }) as never);

  displayObject.on('pointerup', ((payload: PointerDispatchPayload) => {
    logger(`${payload.sourceCanvas}: ${name} -> pointerup @ (${payload.x.toFixed(0)}, ${payload.y.toFixed(0)})`);
  }) as never);
}
