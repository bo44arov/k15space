# K15.Space

Офіційний статичний сайт простору K15.Space у центрі Києва.

## Структура проєкту

- `dist/` — готові файли сайту;
- `scripts/validate-site.mjs` — перевірка HTML-сторінок і локальних посилань.

## Локальний запуск

```powershell
python -m http.server 8080 --directory dist
```

Після запуску сайт доступний за адресою `http://localhost:8080`.

## Перевірка

```powershell
node scripts/validate-site.mjs
```

## Публікація

Сайт публікується через Cloudflare Pages із гілки `main`. Команда збірки не потрібна, каталог публікації — `dist`.
