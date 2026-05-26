# Pixi Container to Skia Renderer

Тестовое задание для `sboard.online`.

Проект демонстрирует один и тот же `scene graph` в двух представлениях:

- `Pixi` как source of truth
- `Skia` как кастомный replay-рендер поверх `PIXI.Container`

## Что реализовано

- поддержка `translate`, `rotate`, `scale` у вложенных контейнеров
- поддержка `PIXI.Graphics` команд `drawShape`, `drawRect`, `drawEllipse`, `moveTo`, `lineTo`
- поддержка `PIXI.Sprite` для PNG
- `pointerdown` / `pointerup` на обеих канвах
- переключение сцен и генерация случайной фигуры
- экспорт текущей сцены в векторный PDF через Skia PDF backend

## Stack

- TypeScript
- Vite
- `pixi.js-legacy@7.2.4`
- `html2pdf-skia`

## Запуск

```bash
npm install
npm run dev
```

Приложение будет доступно по адресу:

```text
http://127.0.0.1:4173
```

## Production build

```bash
npm run build
```

Сборка проходит без TypeScript-ошибок.

## Структура проекта

### `src/pixi-tracker.ts`

Monkey patch для `PIXI.Graphics`, который записывает команды рисования в удобный для replay формат.

### `src/scene.ts`

Создание демо-сцен для проверки трансформаций, hit-testing и PDF export.

### `src/hit-test.ts`

Ручной hit-testing по scene graph:

- обратный обход дерева
- перевод глобальной точки в локальные координаты объекта
- проверки для прямоугольников, эллипсов, линий и спрайтов

### `src/skia-renderer.ts`

Кастомный рендерер, который:

- обходит `PIXI.Container`
- переносит `worldTransform` в Skia
- переводит tracked-команды в Skia drawing API
- экспортирует ту же сцену в PDF

### `src/main.ts`

UI, управление сценами, лог событий, экспорт PDF и связывание Pixi/Skia-поверхностей.

## Соответствие тестовому заданию

1. `TypeScript` — выполнено
2. `pixi.js 7.2.4 legacy + forceCanvas=true` — выполнено
3. Обёртка для рендера `PIXI.Container` через `Skia` — выполнено
4. `translate / rotate / scale` — выполнено
5. `PIXI.Graphics` и `PIXI.Sprite` — выполнено
6. `pointerDown / pointerUp` на обеих канвах — выполнено
7. Простая интерактивность — выполнено
8. Экспорт в векторный PDF — выполнено

## Примечания

- Для PNG-спрайта используется встроенный `data URL`, чтобы проект запускался без внешних ассетов.
- Основной акцент сделан на ясный pipeline: `Pixi scene graph -> tracked commands -> Skia canvas/PDF`.
- PDF backend тянет `wasm`, поэтому production bundle ожидаемо крупнее обычного frontend demo.
