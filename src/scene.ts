import * as PIXI from 'pixi.js-legacy';
import { bindDebugPointerLogs, createTrackedGraphics, createTrackedSprite } from './pixi-tracker';
import type { DemoScene, TrackedGraphics } from './types';

const VIEW_WIDTH = 900;
const VIEW_HEIGHT = 560;

export interface SceneFactoryOptions {
  log: (message: string) => void;
}

export interface SceneSet {
  scenes: DemoScene[];
  addRandomShape: (scene: DemoScene) => void;
}

function createDemoSpritePng(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 88;
  canvas.height = 88;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('2D canvas context is unavailable');
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#12243f';
  ctx.beginPath();
  ctx.roundRect(8, 8, 72, 72, 18);
  ctx.fill();

  ctx.strokeStyle = '#f4c95d';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(26, 26);
  ctx.lineTo(63, 63);
  ctx.moveTo(63, 26);
  ctx.lineTo(26, 63);
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PNG', 44, 78);

  return canvas.toDataURL('image/png');
}

async function createSceneOne(log: (message: string) => void, spriteTexture: PIXI.Texture, spriteUrl: string): Promise<DemoScene> {
  const root = new PIXI.Container();

  const mainContainer = root;
  const subContainer = new PIXI.Container();
  subContainer.position.set(75, 50);

  const g1 = createTrackedGraphics('ellipse-red');
  g1.beginFill('#ff4d4f').drawShape(new PIXI.Ellipse(0, 0, 200, 100)).endFill();
  g1.position.set(220, 120);
  g1.angle = 30;
  bindDebugPointerLogs(g1, log);

  const g2 = createTrackedGraphics('rect-blue');
  g2.beginFill('#3b82f6').drawShape(new PIXI.Rectangle(-50, -75, 100, 150)).endFill();
  g2.position.set(120, 60);
  g2.angle = 15;
  g2.scale.set(1.5, 1.7);
  bindDebugPointerLogs(g2, log);

  const g3 = createTrackedGraphics('line-white');
  g3.lineStyle(10, '#f8fafc', 1).moveTo(0, 0).lineTo(150, 100);
  g3.angle = -20;
  bindDebugPointerLogs(g3, log);

  const g4 = createTrackedGraphics('line-yellow');
  g4.lineStyle(10, '#facc15', 1).moveTo(0, 70).lineTo(150, -30);
  g4.angle = 20;
  bindDebugPointerLogs(g4, log);

  const sprite = createTrackedSprite(spriteTexture, spriteUrl, 'sprite-png');
  sprite.position.set(670, 150);
  sprite.anchor.set(0.5);
  sprite.scale.set(1.25);
  bindDebugPointerLogs(sprite, log);

  subContainer.addChild(g3, g4);
  mainContainer.addChild(subContainer, g1, g2, sprite);

  return {
    id: 'scene-a',
    title: 'Базовая сцена с трансформациями',
    description: 'Вложенный контейнер, заливки, линии, спрайт, rotation, translation и scale.',
    root,
  };
}

async function createSceneTwo(log: (message: string) => void, spriteTexture: PIXI.Texture, spriteUrl: string): Promise<DemoScene> {
  const root = new PIXI.Container();

  const board = createTrackedGraphics('board-backdrop');
  board.beginFill('#172554').drawShape(new PIXI.Rectangle(40, 40, 820, 480)).endFill();
  bindDebugPointerLogs(board, log);

  const card = createTrackedGraphics('card-green');
  card.beginFill('#22c55e').drawShape(new PIXI.Rectangle(-110, -70, 220, 140)).endFill();
  card.lineStyle(6, '#052e16', 0.9).drawRect(-110, -70, 220, 140);
  card.position.set(260, 220);
  card.angle = -12;
  bindDebugPointerLogs(card, log);

  const orbit = new PIXI.Container();
  orbit.position.set(620, 320);
  orbit.angle = 24;

  const radialLine = createTrackedGraphics('radial-line');
  radialLine.lineStyle(12, '#38bdf8', 1).moveTo(-140, 0).lineTo(140, 0);
  bindDebugPointerLogs(radialLine, log);

  const tallRect = createTrackedGraphics('tall-rect');
  tallRect.beginFill('#f97316').drawShape(new PIXI.Rectangle(-50, -150, 100, 300)).endFill();
  tallRect.scale.set(0.8, 1.1);
  bindDebugPointerLogs(tallRect, log);

  const sprite = createTrackedSprite(spriteTexture, spriteUrl, 'sprite-corner');
  sprite.position.set(720, 140);
  sprite.anchor.set(0.5);
  sprite.angle = -18;
  sprite.scale.set(0.9);
  bindDebugPointerLogs(sprite, log);

  orbit.addChild(radialLine, tallRect);
  root.addChild(board, card, orbit, sprite);

  return {
    id: 'scene-b',
    title: 'Слоистая сцена для проверки',
    description: 'Крупные прямоугольники, пересекающиеся линии и повернутый спрайт для hit-testing и PDF export.',
    root,
  };
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomColor(): number {
  return Math.floor(Math.random() * 0xffffff);
}

function createRandomShape(name: string, log: (message: string) => void): TrackedGraphics {
  const graphic = createTrackedGraphics(name);
  const variant = Math.floor(Math.random() * 3);

  if (variant === 0) {
    graphic.beginFill(randomColor(), 0.9).drawShape(new PIXI.Rectangle(-40, -30, 80, 60)).endFill();
  } else if (variant === 1) {
    graphic.beginFill(randomColor(), 0.85).drawShape(new PIXI.Ellipse(0, 0, 50, 32)).endFill();
  } else {
    graphic.lineStyle(8, randomColor(), 1).moveTo(-60, -30).lineTo(55, 35);
  }

  graphic.position.set(randomBetween(120, VIEW_WIDTH - 120), randomBetween(120, VIEW_HEIGHT - 120));
  graphic.angle = randomBetween(-45, 45);
  graphic.scale.set(randomBetween(0.7, 1.35), randomBetween(0.7, 1.35));
  bindDebugPointerLogs(graphic, log);

  return graphic;
}

export async function createSceneSet(options: SceneFactoryOptions): Promise<SceneSet> {
  const spriteUrl = createDemoSpritePng();
  const spriteTexture = await PIXI.Assets.load<PIXI.Texture>(spriteUrl);

  const scenes = [
    await createSceneOne(options.log, spriteTexture, spriteUrl),
    await createSceneTwo(options.log, spriteTexture, spriteUrl),
  ];

  return {
    scenes,
    addRandomShape(scene) {
      const shape = createRandomShape(`random-${Date.now()}`, options.log);
      scene.root.addChild(shape);
    },
  };
}
