# Публикация обновления (Voice Portal)

## Быстрый цикл

1. Поднять версию в `package.json` (`version`).
2. Закоммитить изменения и сделать `git push origin main`.
3. Задать GitHub-токен и собрать/опубликовать:

```powershell
cd d:\VoicePortal\client
$env:GH_TOKEN = "ghp_ВАШ_ТОКЕН"   # один раз в сессии
npm run release:publish
```

Токен создаётся в GitHub: **Settings → Developer settings → Personal access tokens**; нужна scope **repo**.

## Без токена

- `npm run release` — только сборка, установщик появится в `release/` (например `Voice Portal Setup 1.0.20.exe`), на GitHub ничего не загружается.
- Чтобы выложить обновление вручную: на странице репозитория **Releases → Create a new release**, тег `v1.0.20`, приложить файлы из `client/release/`.
