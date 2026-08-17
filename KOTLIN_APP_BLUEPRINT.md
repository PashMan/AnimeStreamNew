# 🪐 KamiAnime: Исчерпывающее техническое задание (ТЗ) для Android Kotlin приложения

Это руководство содержит **абсолютно полные технические детали**, пути, ключи и схемы взаимодействия с бэкендом KamiAnime для клонирования функционала нашего веб-сайта в нативное Android-приложение на Kotlin. Передайте этот файл вашей ИИ-модели для Kotlin — здесь есть всё для 100% совместимости с нашими серверами.

---

## 🔗 1. Серверные хосты и авторизация

Интегрируйте эти URL в качестве базовых для сетевого клиента (например, Retrofit2/Ktor) в мобильном приложении:

*   **Production API URL:** `https://ais-pre-xrtc32traso3yympeghpvg-56932099569.us-east1.run.app`
*   **Development API URL:** `https://ais-dev-xrtc32traso3yympeghpvg-56932099569.us-east1.run.app`
*   **WebSocket URL:** `wss://ais-pre-xrtc32traso3yympeghpvg-56932099569.us-east1.run.app`

### Настройка HTTP-клиента (OkHttpClient / Ktor)
Для всех запросов к API необходимо настроить следующие заголовки:
1.  `User-Agent`: Любой стандартный мобильный или кастомный, например: `KamiAnimeAndroid/1.0.0 (Android; SDK 34)`.
2.  `Referer` (для медиа и картинок): `https://shikimori.one/`.
3.  **Cookies / Сессии:** Если вы используете локальную сессию или токен авторизации (UUID юзера), передавайте его в качестве уникального идентификатора в SQL Прокси.

---

## 🖼️ 2. Работа с изображениями (Обход CORS и Referer)

Shikimori блокирует прямые запросы изображений с мобильных устройств и сторонних доменов без правильного заголовка Referer. Наш бэкенд имеет встроенный качественный прокси-сервер для картинок.

*   Вместо оригинального пути изображений Shikimori:
    `https://shikimori.one/system/animes/original/40748.jpg`
*   Мобильное приложение **ДОЛЖНО** отправлять запрос через наш прокси:
    `https://{ВАШ_ДОМЕН}/api/image/system/animes/original/40748.jpg`

При получении ошибки (например, 404 или 403), наш бэкенд на лету переключится на децентрализованный резервный источник **Jikan API**, скачает правильный постер и отдаст его приложению с заголовком вечного кэширования `Cache-Control: public, max-age=2592000`.

---

## 📺 3. Каталог, Балансировщик озвучек и Нативный Плеер

Наш бэкенд полностью проксирует и декриптует потоки популярных балансировщиков (Kodik, Collaps, Anilibria). Android-приложению **запрещается** использовать тяжелый лагающий `WebView` с кучей рекламы. Стриминг видео должен идти напрямую в нативный плеер на базе **Media3 ExoPlayer**.

### Схема работы плеера:

```
[Shikimori ID] ➔ GET /api/balancer ➔ Список переводов & iframe URL 
                    ➔ GET /api/media/playlist?url={url} ➔ Плейлист со ссылками .m3u8 
                    ➔ Нативный плеер ExoPlayer (проигрывание потока /api/media/segment)
```

### Шаг А: Получение списка переводов и серий
Отправьте HTTP `GET`-запрос на балансировщик KamiAnime:
*   **Эндпоинт:** `GET /api/balancer`
*   **Query-параметры:**
    *   `shikimori_id` (строка, например, `40748`)
    *   `title` (строка, опционально)
    *   `year` (число, опционально)
*   **Пример ответа (JSON):**
```json
{
  "shikimori_id": "40748",
  "kinopoisk_id": "1391789",
  "translations": [
    {
      "id": 609,
      "title": "Anilibria",
      "type": "voice",
      "iframe": "https://kodikplayer.com/seria/1032581/db7cc4293ed475c4ad1fd599d114f4435/720p?api=1"
    },
    {
      "id": 113,
      "title": "Studio Band",
      "type": "voice",
      "iframe": "https://kodikplayer.com/seria/1032585/db7cc4293ed475c4ad1fd599d114f4435/720p?api=1"
    }
  ],
  "anilibria": {
    "has_direct": true,
    "data": {}
  }
}
```

### Шаг Б: Трансляция iframe-ссылки в нативные .m3u8
1.  Возьмите выбранный `iframe` URL озвучки.
2.  Отправьте его на парсер:
    *   **Эндпоинт:** `GET /api/media/playlist?url={URL_ИЗ_IFRAME}` (URL обязательно заэнкодить!)
3.  **Пример ответа (JSON):**
```json
{
  "success": true,
  "links": {
    "360": [
      {
        "src": "https://{ДОМЕН}/api/media/segment?url=https%3A%2F%2Fedge-c1.kodik.info%2F...%2Findex.m3u8",
        "type": "application/x-mpegURL"
      }
    ],
    "720": [
      {
        "src": "https://{ДОМЕН}/api/media/segment?url=https%3A%2F%2Fedge-c1.kodik.info%2F...%2F720.json.m3u8",
        "type": "application/x-mpegURL"
      }
    ]
  }
}
```
4.  Выбирайте нужное разрешение (ключ `720` или `480`), берите строку `src` и передавайте её в ExoPlayer.

### Шаг В: Важная настройка ExoPlayer (Решение ошибок зависания сети)
Все ссылки в нашем плейлисте ведут на прокси-эндпоинт `/api/media/segment`. Сервер перехватывает запросы сегментов внутри стрима и передает их балансировщику с нужными заголовками авторизации для обхода CORS. На стороне Android вам необходимо отключить "беспрепятственное Chunkless" декодирование и разрешить перенаправления в настройках источника HLS:

```kotlin
// Настройка источника HLS в Android Kotlin
val dataSourceFactory = DefaultHttpDataSource.Factory()
    .setUserAgent("KamiAnimeAndroid/1.0.0")
    .setAllowCrossProtocolRedirects(true)

val mediaItem = MediaItem.Builder()
    .setUri(selectedM3u8Uri)
    .setMimeType(MimeTypes.APPLICATION_M3U8)
    .build()

val hlsMediaSource = HlsMediaSource.Factory(dataSourceFactory)
    .setAllowChunklessPreparation(false) // Обязательно false! Точно разберет HLS-прокси
    .createMediaSource(mediaItem)

exoPlayer.setMediaSource(hlsMediaSource)
exoPlayer.prepare()
exoPlayer.play()
```

---

## 📥 4. Система фонового скачивания аниме и конвертации в MP4

Наш бэкенд умеет конвертировать динамические HLS-потоки в готовый к скачиванию на одиночный MP4-клиент файл прямо на сервере.

1.  **Запустить задачу склейки:**
    *   **Эндпоинт:** `GET /api/media/download/start`
    *   **Параметры:**
        *   `url`: Iframe URL озвучки (закодированный).
        *   `quality`: По умолчанию `720` (или `360`, `480`).
        *   `title`: Название тайтла на английском / русском для красивого имени файла.
        *   `episode`: Номер серии (строка).
    *   **Ответ:** `{ "success": true, "taskId": "dl_171804...a2v", "fileName": "My_Anime_Ep_1_720p.mp4" }`
2.  **Проверка прогресса склейки (Опрос с интервалом в 2 секунды):**
    *   **Эндпоинт:** `GET /api/media/download/progress?taskId={TASK_ID}`
    *   **Ответ:**
        ```json
        {
          "id": "dl_171804...",
          "stage": "downloading", // 'resolving' | 'downloading' | 'muxing' | 'completed' | 'failed'
          "processed": 142,      // обработано сегментов
          "total": 350,          // всего сегментов
          "progress": 40.5,      // процент прогресса (float)
          "status": "running",   // 'running' | 'completed' | 'failed'
          "error": null,
          "fileName": "My_Anime_Ep_1_720p.mp4"
        }
        ```
3.  **Получить готовый файл:**
    Как только `status` станет `"completed"`, мобильное приложение может скачать готовый MP4-файл напрямую средствами встроенного DownloadManager в Android:
    *   **Эндпоинт:** `GET /api/media/download/file?taskId={TASK_ID}`
    *   *(Сервер вернет стрим типа `video/mp4` с заголовком `Content-Disposition: attachment`). файлы хранятся на сервере 2 часа.*

---

## 🗄️ 5. Мощный универсальный SQL D1 API клиент (CRUD Прокси)

Каждое действие пользователя — комментарии, списки ("смотрю", "просмотрено"), лайки, отзывы, форумы, клубы, личные сообщения, создание коллекций — синхронизировано с базой данных Cloudflare D1 SQL через одну удобную точку входа на нашем бэкенде.

*   **HTTP Метод:** `POST`
*   **Эндпоинт:** `/api/db/query`
*   **Headers:** `Content-Type: application/json`

Вот точные спецификации отправляемых JSON-посылок для всех фич сайта:

### А. Таблица Пользователей и Профили (`table: "profiles"`)
Для нативного профиля пользователя.

1.  **Создать или обновить профиль пользователя (Регистрация/Вход):**
    ```json
    {
      "table": "profiles",
      "action": "insert",
      "payload": {
        "id": "USER_ID_FROM_MOBILE_AUTH_OR_UUID",
        "email": "user@gmail.com",
        "name": "SuperOtaku",
        "avatar": "/api/image/system/users/custom.png",
        "bio": "Люблю Наруто"
      }
    }
    ```
2.  **Получить профиль конкретного пользователя (SELECT):**
    ```json
    {
      "table": "profiles",
      "action": "select",
      "cols": "*",
      "wheres": [
        { "col": "id", "op": "=", "val": "USER_ID_FROM_AUTH" }
      ],
      "isSingle": true
    }
    ```
3.  **Обновить профиль пользователя (Кастомизация/Изменение дизайна):**
    ```json
    {
      "table": "profiles",
      "action": "update",
      "wheres": [
        { "col": "id", "op": "=", "val": "USER_ID_FROM_AUTH" }
      ],
      "payload": {
        "name": "Новый Ник",
        "bio": "Люблю Наруто ещё сильнее!",
        "theme_color": "#ff007f",
        "card_bg": "https://some-web-image.jpg"
      }
    }
    ```

### Б. Списки Просмотра (Интеграция с трекером)
Пользовательские списки аниме: `"watched_anime_ids"`, `"watching_anime_ids"`, `"dropped_anime_ids"` хранятся в полях таблицы `profiles` в виде строковых JSON-массивов (например: `'["1535","16498"]'`).

Чтобы добавить аниме в список "Смотрю":
1.  Получите текущий профиль пользователя.
2.  Распарсите поле `watching_anime_ids` (по дефолту `'[]'`) на клиенте в Kotlin список.
3.  Добавьте или удалите `shikimori_id` и сохраните обратно:
    ```json
    {
      "table": "profiles",
      "action": "update",
      "wheres": [{ "col": "id", "op": "=", "val": "USER_ID_FROM_AUTH" }],
      "payload": {
        "watching_anime_ids": "[\"21\",\"40748\"]"
      }
    }
    ```

### В. Комментарии к Аниме (`table: "comments"`)
1.  **Получить список комментариев для аниме:**
    ```json
    {
      "table": "comments",
      "action": "select",
      "cols": "*",
      "wheres": [
        { "col": "target_id", "op": "=", "val": "40748" }
      ],
      "orders": [
        { "col": "created_at", "ascending": false }
      ]
    }
    ```
2.  **Добавить новый комментарий к аниме:**
    ```json
    {
      "table": "comments",
      "action": "insert",
      "payload": {
        "target_id": "40748",
        "user_name": "SuperOtaku",
        "user_avatar": "/api/image/system/users/avatar.jpg",
        "text": "Отличная серия! Жду продолжения."
      }
    }
    ```

### Г. Обзоры и подробные Рецензии на аниме (`table: "reviews"`)
1.  **Получить рецензии для аниме по его Shikimori ID:**
    ```json
    {
      "table": "reviews",
      "action": "select",
      "cols": "*",
      "wheres": [
        { "col": "anime_id", "op": "=", "val": "40748" }
      ],
      "orders": [
        { "col": "created_at", "ascending": false }
      ]
    }
    ```
2.  **Опубликовать детальную рецензию:**
    ```json
    {
      "table": "reviews",
      "action": "insert",
      "payload": {
        "id": "CUST_UUID",
        "anime_id": "40748",
        "user_email": "user@gmail.com",
        "content": "Сюжет просто 10/10, визуал тащит студия MAPPA, но звук подкачал.",
        "rating_plot": 10,
        "rating_sound": 7,
        "rating_visuals": 10,
        "rating_overall": 9
      }
    }
    ```

### Д. Авторские Коллекции Аниме (`table: "community_collections"`, `table: "community_collection_items"`)
1.  **Получить список всех публичных коллекций:**
    ```json
    {
      "table": "community_collections",
      "action": "select",
      "cols": "*",
      "wheres": [
        { "col": "is_public", "op": "=", "val": 1 }
      ],
      "orders": [
        { "col": "created_at", "ascending": false }
      ]
    }
    ```
2.  **Добавить аниме в коллекцию с привкусом постера:**
    ```json
    {
      "table": "community_collection_items",
      "action": "insert",
      "payload": {
        "collection_id": "COLLECTION_UUID",
        "anime_id": "40748",
        "anime_title": "Магическая битва",
        "anime_image": "system/animes/original/40748.jpg"
      }
    }
    ```

### Е. Клубы по интересам (`table: "clubs"`, `table: "club_members"`, `table: "club_messages"`)
1.  **Получить список клубов:**
    ```json
    {
      "table": "clubs",
      "action": "select",
      "cols": "*"
    }
    ```
2.  **Вступить в Клуб:**
    ```json
    {
      "table": "club_members",
      "action": "insert",
      "payload": {
        "club_id": "CLUB_UUID",
        "user_id": "USER_ID",
        "role": "member",
        "status": "active"
      }
    }
    ```
3.  **Получить чат Клуба:**
    ```json
    {
      "table": "club_messages",
      "action": "select",
      "cols": "*",
      "wheres": [
        { "col": "club_id", "op": "=", "val": "CLUB_UUID" }
      ],
      "orders": [
        { "col": "created_at", "ascending": true }
      ]
    }
    ```

---

## 🤝 6. Совместный просмотр в реальном времени (WebSockets)

Очередь сообщений синхронизации воспроизведения в комнатах строится на полнодуплексных WebSocket соединениях.

*   **URL:** `wss://{ДОМЕН}/ws/room?roomId={ROOM_ID}&clientId={CLIENT_ID}&name={USER_NAME}&avatar={AVATAR_URI}`

### Обработка событий сокета:

#### 1. Входящее: Инициализация комнаты (`init-state`)
Получаете сразу после открытия соединения. Загружайте в плеер нужный сериал/серию и готовьтесь к сигналингу.
```json
{
  "type": "init-state",
  "clientId": "your_client_id_here",
  "role": "viewer", // "host" или "viewer"
  "users": [
    { "clientId": "id1", "name": "Admin", "avatar": "...", "isMuted": true, "isHost": true },
    { "clientId": "your_client_id_here", "name": "SuperOtaku", "avatar": "...", "isMuted": true, "isHost": false }
  ],
  "playerState": {
    "isPlaying": false,
    "time": 240.2, // секунды
    "episode": "3 серия",
    "updatedAt": 171804000300
  }
}
```

#### 2. Входящее: Обновление участников (`room-users-updated`)
Прилетает при входе/выходе ребят. Отрисуйте крутой список гостей комнаты с микрофончиками.
```json
{
  "type": "room-users-updated",
  "users": [ ... ]
}
```

#### 3. Изменение состояния плеера (Синхронизация воспроизведения)
*   **Хост** перематывает или ставит на паузу. Клиент хоста шлет:
    ```json
    {
      "type": "player-state-update",
      "isPlaying": false,
      "time": 412.3,
      "episode": "4 серия"
    }
    ```
*   **Все участники** получают рассылку-броадкаст от сервера:
    ```json
    {
      "type": "player-state-broadcast",
      "senderId": "host_id",
      "isPlaying": false,
      "time": 412.3,
      "episode": "4 серия"
    }
    ```
    *Зрительский плеер ловит и незамедлительно выставляет:*
    `exoPlayer.seekTo(412300)` (конвертируем в миллисекунды) и переключает состояние воспроизведения.

---

## 🎙️ 7. WebRTC Голосовой чат (Mesh-сеть Без Сервера)

Каждая комната совместного просмотра поддерживает WebRTC голосовое общение без задержки.

1.  **Создайте нативную обертку PeerConnectionFactory:**
    Для каждого присутствующего участника (`users` из сокета с вашим отличным `clientId`):
    *   Создавайте локальный `RTCPeerConnection`.
    *   Добавьте STUN-сервер `stun:stun.l.google.com:19302`.
2.  **Генерация Offer/Answer (Сигналинг через сокет):**
    Обменивайтесь SDP сессионными параметрами и ICE кандидатами. Любое сообщение с типом `webrtc-signal` сервер перешлет напрямую к `targetId`:
    *   **Отправка сигнала на сокет:**
        ```json
        {
          "type": "webrtc-signal",
          "targetId": "RECIPIENT_CLIENT_ID",
          "signal": {
            "sdp": "...Сессия...",
            "candidate": null
          }
        }
        ```
    *   **Получение релевантного сигнала (Сервер транслирует клиенту):**
        ```json
        {
          "type": "webrtc-signal-relay",
          "senderId": "SENDER_CLIENT_ID",
          "signal": {
            "sdp": "...Сессия...",
            "candidate": null
          }
        }
        ```
3.  **Важное условие стабильности WebRTC на Android:**
    *   Создайте временную очередь `ArrayList<IceCandidate>` на клиенте.
    *   До вызова `peerConnection.setRemoteDescription(desc)` все прилетающие ICE-кандидаты складывайте в эту очередь!
    *   После успешного callback-завершения `setRemoteDescription`, пройдитесь циклом по очереди и сделайте `peerConnection.addIceCandidate(item)`. Только тогда голос заработает!

---

## 🤖 8. Интеграция с ИИ KamiAnime (Нейро-Бот)

Мобильное приложение содержит интеллектуальный чат-бот для генерации аниме рекомендаций с обработкой умных ссылок.

*   **HTTP метод:** `POST`
*   **Эндпоинт:** `/api/ai/recommend`
*   **Тело запроса:**
    ```json
    {
      "messages": [
        { "role": "user", "content": "Рекомендуй аниме похожее на Магическую Битву" }
      ]
    }
    ```
*   **Тело ответа (Markdown):**
    ```json
    {
      "text": "Мне кажется, тебе очень понравится [Человек-бензопила](/anime/44511). Оно драйвовое, мрачное и с отличным юмором!"
    }
    ```

### Важнейшая штука для Android UI:
В тексте нейросетки ссылки зашиты в формате markdown: `[Имя Аниме](/anime/ID)`.
Мобильное приложение **ОБЯЗАНО** перехватывать клики по ссылкам, содержащим `/anime/`, парсить этот `ID` (Shikimori ID) и вместо внешней страницы открывать роскошную нативную карточку этого аниме внутри нативного приложения! Это создает невероятно плавный, цельный опыт использования.

---

### 🎯 Вспомогательный класс для сопоставления таблиц БД в Kotlin:

```kotlin
// Модель для сетевого запроса к нашему универсальному CRUD Прокси
data class DbQueryRequest(
    val table: String,
    val action: String, // "select" | "insert" | "update" | "delete" | "rpc"
    val cols: String = "*",
    val wheres: List<WhereClause>? = null,
    val orders: List<OrderClause>? = null,
    val limit: Int? = null,
    val payload: Any? = null,
    val isSingle: Boolean = false
)

data class WhereClause(
    val col: String,
    val op: String, // "=", "LIKE", "IN", "!=", ">"
    val valField: Any // Ключ назван 'val' на JS, в Kotlin используйте сериализуемое название класса или @SerializedName("val")
)

data class OrderClause(
    val col: String,
    val ascending: Boolean = true
)
```

Передайте этот файл вашей ИИ-модели для Kotlin (например, в Android Studio), и она с легкостью напишет нативный, быстрый и стабильный плеер, синхронизированный чат, загрузчик серий в MP4 и социальные фичи!
