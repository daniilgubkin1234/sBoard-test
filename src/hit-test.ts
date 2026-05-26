import * as PIXI from 'pixi.js-legacy';
import { getTrackedCommands } from './pixi-tracker';
import type { PointerDispatchPayload, SourceCanvasKind, TrackedGraphics, TrackedSprite } from './types';

function toCanvasPoint(event: PointerEvent, canvas: HTMLCanvasElement): PIXI.Point {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  return new PIXI.Point(x, y);
}

function toLocalPoint(displayObject: PIXI.DisplayObject, point: PIXI.Point): PIXI.Point {
  return displayObject.worldTransform.applyInverse(point, new PIXI.Point());
}

function isPointInsideRect(point: PIXI.Point, x: number, y: number, width: number, height: number, tolerance: number): boolean {
  return (
    point.x >= x - tolerance &&
    point.x <= x + width + tolerance &&
    point.y >= y - tolerance &&
    point.y <= y + height + tolerance
  );
}

function isPointInsideEllipse(point: PIXI.Point, x: number, y: number, radiusX: number, radiusY: number, tolerance: number): boolean {
  const safeRadiusX = Math.max(radiusX + tolerance, 1);
  const safeRadiusY = Math.max(radiusY + tolerance, 1);
  const dx = (point.x - x) / safeRadiusX;
  const dy = (point.y - y) / safeRadiusY;
  return dx * dx + dy * dy <= 1;
}

function distanceToSegment(point: PIXI.Point, from: PIXI.Point, to: PIXI.Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lenSquared = dx * dx + dy * dy;

  if (lenSquared === 0) {
    return Math.hypot(point.x - from.x, point.y - from.y);
  }

  const t = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lenSquared));
  const closestX = from.x + t * dx;
  const closestY = from.y + t * dy;
  return Math.hypot(point.x - closestX, point.y - closestY);
}

function hitTestGraphics(displayObject: TrackedGraphics, globalPoint: PIXI.Point): boolean {
  const localPoint = toLocalPoint(displayObject, globalPoint);
  const commands = getTrackedCommands(displayObject);

  let hasFill = false;
  let strokeWidth = 0;
  let currentPoint: PIXI.Point | null = null;

  for (const command of commands) {
    switch (command.kind) {
      case 'beginFill':
        hasFill = command.alpha > 0;
        break;
      case 'lineStyle':
        strokeWidth = command.alpha > 0 ? command.width : 0;
        break;
      case 'endFill':
        hasFill = false;
        break;
      case 'drawRect': {
        if (hasFill && isPointInsideRect(localPoint, command.x, command.y, command.width, command.height, 0)) {
          return true;
        }
        if (strokeWidth > 0 && isPointInsideRect(localPoint, command.x, command.y, command.width, command.height, strokeWidth / 2)) {
          return true;
        }
        break;
      }
      case 'drawEllipse': {
        if (hasFill && isPointInsideEllipse(localPoint, command.x, command.y, command.radiusX, command.radiusY, 0)) {
          return true;
        }
        if (strokeWidth > 0 && isPointInsideEllipse(localPoint, command.x, command.y, command.radiusX, command.radiusY, strokeWidth / 2)) {
          return true;
        }
        break;
      }
      case 'moveTo':
        currentPoint = new PIXI.Point(command.x, command.y);
        break;
      case 'lineTo': {
        if (currentPoint && strokeWidth > 0) {
          const nextPoint = new PIXI.Point(command.x, command.y);
          if (distanceToSegment(localPoint, currentPoint, nextPoint) <= strokeWidth / 2 + 4) {
            return true;
          }
          currentPoint = nextPoint;
        }
        break;
      }
    }
  }

  return false;
}

function hitTestSprite(displayObject: TrackedSprite, globalPoint: PIXI.Point): boolean {
  const localPoint = toLocalPoint(displayObject, globalPoint);
  const left = -displayObject.anchor.x * displayObject.width;
  const top = -displayObject.anchor.y * displayObject.height;
  return isPointInsideRect(localPoint, left, top, displayObject.width, displayObject.height, 0);
}

function findTopmostHit(displayObject: PIXI.DisplayObject, globalPoint: PIXI.Point): PIXI.DisplayObject | null {
  if (!displayObject.visible || displayObject.worldAlpha <= 0) {
    return null;
  }

  const maybeContainer = displayObject as PIXI.Container;
  if ('children' in maybeContainer && Array.isArray(maybeContainer.children)) {
    for (let index = maybeContainer.children.length - 1; index >= 0; index -= 1) {
      const child = maybeContainer.children[index];
      const hit = findTopmostHit(child, globalPoint);
      if (hit) {
        return hit;
      }
    }
  }

  if (displayObject instanceof PIXI.Graphics && hitTestGraphics(displayObject as TrackedGraphics, globalPoint)) {
    return displayObject;
  }

  if (displayObject instanceof PIXI.Sprite && hitTestSprite(displayObject as TrackedSprite, globalPoint)) {
    return displayObject;
  }

  return null;
}

export function installPointerDispatcher(
  canvas: HTMLCanvasElement,
  sourceCanvas: SourceCanvasKind,
  getRoot: () => PIXI.Container | null,
): void {
  const forward = (kind: PointerDispatchPayload['kind']) => (event: PointerEvent) => {
    const root = getRoot();

    if (!root) {
      return;
    }

    const point = toCanvasPoint(event, canvas);
    const target = findTopmostHit(root, point);

    if (!target) {
      return;
    }

    const payload: PointerDispatchPayload = {
      kind,
      sourceCanvas,
      x: point.x,
      y: point.y,
    };

    (target as PIXI.DisplayObject & { emit: (event: string, data: PointerDispatchPayload) => void }).emit(kind, payload);
  };

  canvas.addEventListener('pointerdown', forward('pointerdown'));
  canvas.addEventListener('pointerup', forward('pointerup'));
}
