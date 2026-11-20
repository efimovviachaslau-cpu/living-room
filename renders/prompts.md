# Промпты для фото-рендеров (image-to-image)

Исходники — PNG из `renders/raw/`, имя файла: `<вариант>_<палитра>_<камера>_<режим>.png`
(например `B_warm_sofa_clay.png`). Финальные картинки — в `renders/final/` с тем же
именем + `_v1`, `_v2`…

## Что экспортирует просмотрщик на каждую камеру

| Режим | Зачем |
|---|---|
| `color` | цвета стен/пола/мебели из палитры — для img2img с низкой силой |
| `clay` | всё серое матовое — нейросеть сама подбирает материалы, геометрия сохраняется |
| `lines` | контуры (белый фон, чёрные рёбра) — для ControlNet Canny/Lineart |
| `depth` | карта глубины — для ControlNet Depth, держит пропорции лучше всего |

Разрешение фиксированное, не зависит от окна: 1536 × 1024 (3:2), FOV 60°,
высота глаз 150 см (вид сверху — отдельно).

## Базовый промпт (шаблон)

```
Photorealistic interior photograph of a living room, [СТИЛЬ],
[СТЕНЫ: цвет и отделка], [ПОЛ], [ДИВАН: цвет, ткань], [ОСТАЛЬНАЯ МЕБЕЛЬ],
natural daylight from the window on the [СТОРОНА], soft shadows,
shot on a 24mm lens at eye level, realistic materials and textures,
interior design magazine photo.
Keep the exact room geometry, window and door positions, furniture placement and proportions.
```

Негатив: `extra furniture, extra windows, distorted perspective, warped walls, people, text, watermark, fisheye`

## Настройки (заполнить, что сработало)

| Модель / сервис | Сила (denoise) | ControlNet | Итог |
|---|---|---|---|
| | | | |

## Журнал

| Файл-исходник | Промпт (отличия от базового) | Результат | Оценка |
|---|---|---|---|
| | | | |
