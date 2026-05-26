import type * as PIXI from 'pixi.js-legacy';

export type SourceCanvasKind = 'pixi' | 'skia';

export interface PointerDispatchPayload {
  kind: 'pointerdown' | 'pointerup';
  sourceCanvas: SourceCanvasKind;
  x: number;
  y: number;
}

export interface FillCommand {
  kind: 'beginFill';
  color: number;
  alpha: number;
}

export interface LineStyleCommand {
  kind: 'lineStyle';
  width: number;
  color: number;
  alpha: number;
}

export interface EndFillCommand {
  kind: 'endFill';
}

export interface DrawRectCommand {
  kind: 'drawRect';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DrawEllipseCommand {
  kind: 'drawEllipse';
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
}

export interface MoveToCommand {
  kind: 'moveTo';
  x: number;
  y: number;
}

export interface LineToCommand {
  kind: 'lineTo';
  x: number;
  y: number;
}

export type GraphicsCommand =
  | FillCommand
  | LineStyleCommand
  | EndFillCommand
  | DrawRectCommand
  | DrawEllipseCommand
  | MoveToCommand
  | LineToCommand;

export interface TrackedGraphics extends PIXI.Graphics {
  __sboardCommands?: GraphicsCommand[];
  __sboardName?: string;
}

export interface TrackedSprite extends PIXI.Sprite {
  __sboardSourceUrl?: string;
  __sboardName?: string;
}

export interface DemoScene {
  id: string;
  title: string;
  description: string;
  root: PIXI.Container;
}
