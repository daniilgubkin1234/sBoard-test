import * as PIXI from 'pixi.js-legacy';
import './style.css';
import { installPointerDispatcher } from './hit-test';
import { instrumentPixiGraphics } from './pixi-tracker';
import { createSceneSet } from './scene';
import { loadSkiaKit } from './skia-runtime';
import { SkiaRenderer, type ViewportSize } from './skia-renderer';
import type { DemoScene } from './types';

const VIEWPORT: ViewportSize = { width: 900, height: 560 };

declare global {
  interface Window {
    __sboardDebug?: {
      exportCurrentScenePdf: () => { filename: string; size: number } | null;
      dispatchCanvasPointer: (target: 'pixi' | 'skia', x: number, y: number) => boolean;
      getState: () => {
        title: string | null;
        description: string | null;
        log: string[];
      };
    };
  }
}

const appElement = document.querySelector<HTMLDivElement>('#app');
if (!appElement) {
  throw new Error('App root was not found');
}

appElement.innerHTML = `
  <div class="shell">
    <header class="hero">
      <div class="hero-copy">
        <p class="eyebrow">TypeScript + Pixi + Skia PDF backend</p>
        <h1>Рендерер Pixi Container в Skia</h1>
        <p class="lede">
          Демонстрация одного scene graph в двух представлениях: исходный рендер на Pixi и кастомный
          replay в Skia с поддержкой трансформаций, pointer-событий и экспорта в векторный PDF.
        </p>
        <div class="hero-badges">
          <span>2 канвы</span>
          <span>Ручной hit-testing</span>
          <span>Vector PDF export</span>
          <span>drawShape + Sprite</span>
        </div>
      </div>
      <div class="hero-meta">
        <span><strong>Pixi:</strong> source of truth</span>
        <span><strong>Skia:</strong> replay renderer</span>
        <span><strong>PDF:</strong> export из того же pipeline</span>
      </div>
    </header>

    <section class="overview-grid">
      <article class="signal-card">
        <span class="signal-kicker">Рендеринг</span>
        <strong>Одна сцена, два backend-а</strong>
        <p>Слева живёт исходный scene graph на Pixi, справа его воспроизведение через Skia.</p>
      </article>
      <article class="signal-card">
        <span class="signal-kicker">Трансформации</span>
        <strong>Translate, rotate, scale</strong>
        <p>Поддерживаются вложенные контейнеры и перенос worldTransform в собственный renderer.</p>
      </article>
      <article class="signal-card">
        <span class="signal-kicker">События</span>
        <strong>Ручной hit-testing</strong>
        <p>Клики обрабатываются на обеих канвах и попадают в единый журнал событий.</p>
      </article>
      <article class="signal-card">
        <span class="signal-kicker">Экспорт</span>
        <strong>Векторный PDF</strong>
        <p>Текущая сцена экспортируется через Skia PDF backend без отдельного маршрута рендера.</p>
      </article>
    </section>

    <section class="toolbar">
      <div class="toolbar-group">
        <button id="switch-scene" type="button">Сменить сцену</button>
        <button id="add-random" type="button">Добавить случайную фигуру</button>
        <button id="rerender" type="button">Перерисовать Skia</button>
      </div>
      <div class="toolbar-group">
        <button id="export-pdf" type="button" class="accent">Экспорт в векторный PDF</button>
      </div>
    </section>

    <section class="status-strip">
      <div>
        <span class="label">Текущая сцена</span>
        <strong id="scene-title">Загрузка...</strong>
      </div>
      <div>
        <span class="label">Описание</span>
        <span id="scene-description">Подготавливаем scene graph и загружаем Skia...</span>
      </div>
    </section>

    <section class="stage-grid">
      <article class="panel">
        <header class="panel-head">
          <div>
            <h2>Канва Pixi</h2>
            <span>Исходный scene graph</span>
          </div>
          <span class="panel-badge">Source of truth</span>
        </header>
        <canvas id="pixi-canvas" width="${VIEWPORT.width}" height="${VIEWPORT.height}"></canvas>
      </article>

      <article class="panel">
        <header class="panel-head">
          <div>
            <h2>Канва Skia</h2>
            <span>Кастомный replay из PIXI.Container</span>
          </div>
          <span class="panel-badge accent-badge">Replay pipeline</span>
        </header>
        <canvas id="skia-canvas" width="${VIEWPORT.width}" height="${VIEWPORT.height}"></canvas>
      </article>
    </section>

    <section class="notes-grid">
      <article class="panel notes">
        <header class="panel-head">
          <div>
            <h2>Что поддерживается</h2>
            <span>Минимальный набор из тестового задания</span>
          </div>
        </header>
        <ul>
          <li>Вложенные трансформации <code>PIXI.Container</code>: translate, rotate и scale.</li>
          <li>Команды <code>PIXI.Graphics</code>: <code>drawShape</code>, <code>drawRect</code>, <code>drawEllipse</code>, <code>moveTo</code>, <code>lineTo</code>.</li>
          <li><code>PIXI.Sprite</code> с PNG-источником, anchor и масштабированием.</li>
          <li>Ручной dispatch событий <code>pointerdown</code> и <code>pointerup</code> на обеих канвах.</li>
          <li>Экспорт векторного PDF через Skia PDF backend.</li>
        </ul>
      </article>

      <article class="panel log-panel">
        <header class="panel-head">
          <div>
            <h2>Журнал событий</h2>
            <span>Последние hit-tested взаимодействия</span>
          </div>
        </header>
        <div id="event-log" class="event-log"></div>
      </article>
    </section>
  </div>
`;

const pixiCanvas = document.querySelector<HTMLCanvasElement>('#pixi-canvas');
const skiaCanvas = document.querySelector<HTMLCanvasElement>('#skia-canvas');
const switchSceneButton = document.querySelector<HTMLButtonElement>('#switch-scene');
const addRandomButton = document.querySelector<HTMLButtonElement>('#add-random');
const rerenderButton = document.querySelector<HTMLButtonElement>('#rerender');
const exportPdfButton = document.querySelector<HTMLButtonElement>('#export-pdf');
const sceneTitle = document.querySelector<HTMLElement>('#scene-title');
const sceneDescription = document.querySelector<HTMLElement>('#scene-description');
const eventLog = document.querySelector<HTMLDivElement>('#event-log');

if (!pixiCanvas || !skiaCanvas || !switchSceneButton || !addRandomButton || !rerenderButton || !exportPdfButton || !sceneTitle || !sceneDescription || !eventLog) {
  throw new Error('App UI failed to initialize');
}

const ui = {
  pixiCanvas,
  skiaCanvas,
  switchSceneButton,
  addRandomButton,
  rerenderButton,
  exportPdfButton,
  sceneTitle,
  sceneDescription,
  eventLog,
};

const logLines: string[] = [];

function pushLog(message: string): void {
  logLines.unshift(`${new Date().toLocaleTimeString()}  ${message}`);
  logLines.splice(14);
  ui.eventLog.innerHTML = logLines.map((line) => `<div class="event-line">${line}</div>`).join('');
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function bootstrap(): Promise<void> {
  instrumentPixiGraphics();
  pushLog('Загружаем Skia runtime...');

  const skiaKit = await loadSkiaKit();
  const skiaRenderer = new SkiaRenderer(skiaKit, ui.skiaCanvas);

  const pixiOptions = {
    view: ui.pixiCanvas,
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    backgroundColor: 0x090e1a,
    antialias: true,
    forceCanvas: true,
  } as unknown as PIXI.IApplicationOptions & { forceCanvas: boolean };

  const pixiApp = new PIXI.Application(pixiOptions);

  const sceneSet = await createSceneSet({ log: pushLog });
  let sceneIndex = 0;
  let currentScene: DemoScene | null = null;

  const exportCurrentScenePdf = (shouldDownload: boolean): { filename: string; size: number } | null => {
    if (!currentScene) {
      return null;
    }

    const pdf = skiaRenderer.exportPdf(currentScene.root, VIEWPORT);
    const filename = `${currentScene.id}.pdf`;

    if (shouldDownload) {
      downloadBlob(pdf, filename);
      pushLog(`Экспортирован ${filename} (${Math.round(pdf.size / 1024)} KB)`);
    }

    return {
      filename,
      size: pdf.size,
    };
  };

  const dispatchCanvasPointer = (target: 'pixi' | 'skia', x: number, y: number): boolean => {
    const canvas = target === 'pixi' ? ui.pixiCanvas : ui.skiaCanvas;
    const rect = canvas.getBoundingClientRect();
    const eventInit: PointerEventInit = {
      bubbles: true,
      clientX: rect.left + x,
      clientY: rect.top + y,
      pointerId: 1,
      pointerType: 'mouse',
    };

    canvas.dispatchEvent(new PointerEvent('pointerdown', eventInit));
    canvas.dispatchEvent(new PointerEvent('pointerup', eventInit));
    return true;
  };

  window.__sboardDebug = {
    exportCurrentScenePdf: () => exportCurrentScenePdf(false),
    dispatchCanvasPointer,
    getState: () => ({
      title: ui.sceneTitle.textContent,
      description: ui.sceneDescription.textContent,
      log: Array.from(ui.eventLog.querySelectorAll('.event-line')).map((node) => node.textContent ?? ''),
    }),
  };

  const syncSceneMeta = () => {
    if (!currentScene) {
      return;
    }
    ui.sceneTitle.textContent = currentScene.title;
    ui.sceneDescription.textContent = currentScene.description;
  };

  const repaintAll = () => {
    if (!currentScene) {
      return;
    }

    pixiApp.renderer.render(pixiApp.stage);
    skiaRenderer.render(currentScene.root, VIEWPORT);
  };

  const mountScene = (nextScene: DemoScene) => {
    pixiApp.stage.removeChildren();
    pixiApp.stage.addChild(nextScene.root);
    currentScene = nextScene;
    syncSceneMeta();
    repaintAll();
    pushLog(`Смонтирована сцена: ${nextScene.title}`);
  };

  mountScene(sceneSet.scenes[sceneIndex]);

  installPointerDispatcher(ui.pixiCanvas, 'pixi', () => currentScene?.root ?? null);
  installPointerDispatcher(ui.skiaCanvas, 'skia', () => currentScene?.root ?? null);

  ui.switchSceneButton.addEventListener('click', () => {
    sceneIndex = (sceneIndex + 1) % sceneSet.scenes.length;
    mountScene(sceneSet.scenes[sceneIndex]);
  });

  ui.addRandomButton.addEventListener('click', () => {
    if (!currentScene) {
      return;
    }
    sceneSet.addRandomShape(currentScene);
    repaintAll();
    pushLog(`Добавлена случайная фигура в сцену: ${currentScene.title}`);
  });

  ui.rerenderButton.addEventListener('click', () => {
    repaintAll();
    pushLog('Skia-представление текущей сцены перерисовано');
  });

  ui.exportPdfButton.addEventListener('click', () => {
    try {
      exportCurrentScenePdf(true);
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      pushLog(`Ошибка экспорта PDF: ${details}`);
    }
  });

  window.addEventListener('beforeunload', () => {
    delete window.__sboardDebug;
    skiaRenderer.dispose();
    pixiApp.destroy(true);
  });

  pushLog('Готово. Попробуй кликнуть по фигурам на обеих канвах и экспортировать PDF.');
}

bootstrap().catch((error: unknown) => {
  const details = error instanceof Error ? error.message : String(error);
  ui.sceneTitle.textContent = 'Ошибка инициализации';
  ui.sceneDescription.textContent = details;
  pushLog(`Ошибка запуска: ${details}`);
});
