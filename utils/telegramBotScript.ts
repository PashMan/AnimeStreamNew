export const PYTHON_BOT_SCRIPT = `import os
import re
import sys
import json
import logging
import asyncio
import threading
import subprocess
import urllib.request
import urllib.parse
import base64
import gradio as gr
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes
from telegram.request import HTTPXRequest

# Настройка логирования
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Токен Телеграм бота (Задайте у себя в Hugging Face / Space Settings -> Repository Secrets)
# ВНИМАНИЕ: Переменные SPACE_ID и SPACE_HOST определяются Hugging Face автоматически. НЕ добавляйте их вручную!
API_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "YOUR_BOT_TOKEN_HERE")

# Абсолютная папка для сохранения скачанных файлов во избежание нестыковок CWD
DOWNLOADS_DIR = os.path.abspath(".")

# API токен для работы с Kodik
KODIK_TOKEN = os.getenv("KODIK_API_TOKEN", "17cc4ee691bc251131a9041e6e89e78e")

# URL вашего веб-приложения для резервного декодирования.
# При копировании скрипта плейсхолдер заменяется на реальный адрес вашего сайта.
_cached_url = None

def get_possible_txt_paths():
    paths = []
    # 1. Специфичный путь рядом со скриптом
    try:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        if base_dir:
            paths.append(os.path.join(base_dir, "web_app_url.txt"))
    except:
        pass
    # 2. Относительный путь в текущей рабочей папке
    paths.append("web_app_url.txt")
    # 3. Абсолютный путь во временной папке (всегда доступен на запись в HF/Docker)
    paths.append("/tmp/web_app_url.txt")
    # 4. Абсолютный путь в домашней папке страницы
    try:
        home_dir = os.path.expanduser("~")
        if home_dir:
            paths.append(os.path.join(home_dir, "web_app_url.txt"))
    except:
        pass
    # Очистим дубликаты сохраняя порядок
    seen = set()
    unique_paths = []
    for p in paths:
        if p not in seen:
            seen.add(p)
            unique_paths.append(p)
    return unique_paths

def is_valid_url(url):
    if not url:
        return False
    url = url.strip()
    return url.startswith(("http://", "https://")) and "PLACEHOLDER" not in url

def get_web_app_url():
    global _cached_url
    if is_valid_url(_cached_url):
        return _cached_url

    # 1. Пытаемся прочитать из всех возможных путей
    for path in get_possible_txt_paths():
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    url = f.read().strip()
                if is_valid_url(url):
                    logger.info(f"Успешно прочитан URL сайта из файла {path}: {url}")
                    _cached_url = url
                    return url
            except Exception as e:
                logger.warning(f"Не удалось прочитать {path}: {e}")

    # 2. Пытаемся взять из переменной окружения
    env_url = os.getenv("WEB_APP_URL", "").strip()
    if is_valid_url(env_url):
        logger.info(f"Используем URL сайта из переменной окружения WEB_APP_URL: {env_url}")
        _cached_url = env_url
        return env_url

    # 3. Возвращаем плейсхолдер по умолчанию
    default_url = "WEB_BASE_URL_PLACEHOLDER"
    if is_valid_url(default_url):
        _cached_url = default_url
        return default_url

    return "WEB_BASE_URL_PLACEHOLDER"

WEB_APP_URL = get_web_app_url()

def convert_char(char, num):
    alph = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    upper = char.upper()
    if upper in alph:
        idx = (alph.index(upper) + num) % len(alph)
        ch = alph[idx]
        return ch.lower() if char.islower() else ch
    return char

def decode_kodik_url(encoded):
    for rot in range(26):
        crypted = "".join(convert_char(c, rot) for c in encoded)
        padding = (4 - (len(crypted) % 4)) % 4
        try:
            padded_str = crypted + "=" * padding
            decoded_bytes = base64.b64decode(padded_str.encode("utf-8"))
            decoded = decoded_bytes.decode("utf-8", errors="ignore")
            if "mp4:hls:manifest" in decoded:
                return decoded
        except Exception:
            pass
    raise ValueError("Decryption of Kodik stream URL failed")

def make_kodik_api_request(anime_id):
    global WEB_APP_URL
    WEB_APP_URL = get_web_app_url()
    
    kodik_tokens = [
        "b7cc4293ed475c4ad1fd599d114f4435",
        "17cc4ee691bc251131a9041e6e89e78e",
        "45c53578f11ecfb74e31267b634cc6a8"
    ]
    env_token = os.getenv("KODIK_API_TOKEN", "")
    if env_token and env_token not in kodik_tokens:
        kodik_tokens.insert(0, env_token)
        
    last_error = "No tokens configured"

    # Сначала пытаемся проксировать запрос через наш сайт, 
    # чтобы обойти блокировки IP адресов Hugging Face со стороны Kodik!
    if is_valid_url(WEB_APP_URL):
        for idx, token in enumerate(kodik_tokens):
            proxy_url = f"{WEB_APP_URL.rstrip('/')}/api/media/search?token={token}&shikimori_id={anime_id}"
            logger.info(f"Querying Kodik API via site proxy: {proxy_url}")
            try:
                req = urllib.request.Request(proxy_url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
                with urllib.request.urlopen(req, timeout=15) as response:
                    resp_text = response.read().decode('utf-8')
                
                if resp_text:
                    info = json.loads(resp_text)
                    if info.get("results"):
                        logger.info("Успешно получили результаты поиска Kodik через прокси сайта!")
                        return info
                    else:
                        logger.warning(f"Kodik API via proxy returned empty results for token {idx}")
                        last_error = f"Kodik API via proxy returned empty results for token {idx}"
            except Exception as pe:
                logger.error(f"Failed to search Kodik via site proxy with token {idx}: {pe}")
                last_error = f"Proxy search error: {str(pe)}"

    # Резервный вариант (прямой запрос на случай если прокси не настроен или недоступен)
    logger.info("Резервный поиск: запрашиваем Kodik API напрямую...")
    for idx, token in enumerate(kodik_tokens):
        api_url = f"https://kodik-api.com/search?token={token}&shikimori_id={anime_id}&with_material_data=true"
        logger.info(f"Querying Kodik API with token index {idx}...")
        try:
            req = urllib.request.Request(api_url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
            with urllib.request.urlopen(req, timeout=10) as response:
                resp_text = response.read().decode('utf-8')
            
            if not resp_text:
                logger.warning(f"Kodik API returned empty response for token index {idx}")
                last_error = f"Token {idx} returned empty response"
                continue
                
            try:
                info = json.loads(resp_text)
            except Exception as je:
                logger.error(f"Kodik API JSON parse error with token {idx}: {je}. Response: {resp_text[:300]}")
                last_error = f"Token {idx} JSON parse error: {resp_text[:100]}"
                continue
                
            if info.get("results"):
                return info
            else:
                logger.warning(f"Kodik API returned no results for token index {idx}")
                last_error = f"Token {idx} returned no results (empty results array)"
        except Exception as e:
            logger.error(f"Kodik API request failed with token index {idx}: {e}")
            last_error = f"Token {idx} network error: {str(e)}"
            
    raise RuntimeError(f"Все доступные API-токены Kodik исчерпали лимит запросов, заблокированы либо не возвращают результатов. Причина: {last_error}")

def extract_m3u8_stream(iframe_url, quality=None):
    global WEB_APP_URL
    WEB_APP_URL = get_web_app_url()
    if iframe_url.startswith("//"):
        iframe_url = "https:" + iframe_url
        
    # Сначала пытаемся использовать дешифратор нашего веб-приложения (рекомендуемый и самый стабильный способ)
    has_web_app = is_valid_url(WEB_APP_URL)
    
    if has_web_app:
        api_url = f"{WEB_APP_URL.rstrip('/')}/api/media/playlist?url={urllib.parse.quote(iframe_url)}&resolve=true"
        logger.info(f"Резолвим поток через API веб-приложения: {api_url}")
        try:
            req = urllib.request.Request(
                api_url, 
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
            )
            with urllib.request.urlopen(req, timeout=20) as response:
                res_data = json.loads(response.read().decode('utf-8'))
                
            if res_data.get("success") and res_data.get("links"):
                # Возвращаем словарь с проксированными И ПРЯМЫМИ ссылками.
                # Для проигрывания в браузере хорош прокси, а для FFmpeg-загрузчика на сервере бота
                # лучше и быстрее использовать прямой URL от CDN Kodik.
                links_dict = {}
                for q in res_data["links"].keys():
                    direct_url = res_data["links"][q]
                    proxied_m3u8 = f"{WEB_APP_URL.rstrip('/')}/api/media/playlist?url={urllib.parse.quote(iframe_url)}&quality={q}"
                    links_dict[q] = [{
                        "src": proxied_m3u8,
                        "direct_src": direct_url
                    }]
                
                available_qualities = sorted([int(k) for k in links_dict.keys()], reverse=True)
                if available_qualities:
                    logger.info("Успешно получили проксированные и прямые потоки через API веб-приложения!")
                    return available_qualities, links_dict
                else:
                    logger.warning("Декодер сайта вернул пустой список разрешений вещания.")
            else:
                logger.warning(f"Декодер сайта сообщил об ошибке: {res_data.get('error', 'Неизвестная ошибка')}")
        except Exception as proxy_err:
            logger.warning(f"Не удалось подключиться к декодеру сайта ({WEB_APP_URL}): {proxy_err}. Пробуем локальный парсинг.")
    else:
        logger.info("Бот не привязан к сайту (WEB_APP_URL не задан или содержит плейсхолдер). Инициализируем локальный парсинг.")

    # Локальный парсинг (резервный вариант)
    # Резолвим домены для борьбы с блокировками и лимитами, как в веб-прокси
    iframe_url = re.sub(
        r'(kodik\\.info|kodik\\.cc|kodik\\.biz|kodik\\.net|kodik\\.tv|kodik\\.club|kodik\\.site|kodik\\.space|kodik\\.ru|kodikonline\\.com|kodikhd\\.club|kodik-api\\.com)', 
        'kodikplayer.com', 
        iframe_url
    )
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://shikimori.one/'
    }
    
    # 1. Загружаем iframe-страницу
    req = urllib.request.Request(iframe_url, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as response:
        html = response.read().decode('utf-8')
        
    # 2. Извлекаем параметры (как в server.ts)
    url_params_match = re.search(r"urlParams\\s*=\\s*'([^']+)'", html) or re.search(r'urlParams\\s*=\\s*"([^"]+)"', html) or re.search(r"urlParams\\s*=\\s*({[^;]+})", html)
    hash_match = re.search(r"\\.hash\\s*=\\s*'([^']+)'", html) or re.search(r'\\.hash\\s*=\\s*"([^"]+)"', html) or re.search(r"""\\.hash\\s*=\\s*['\"]([^'\"]+)['\"]""", html)
    id_match = re.search(r"\\.id\\s*=\\s*'([^']+)'", html) or re.search(r'\\.id\\s*=\\s*"([^"]+)"', html) or re.search(r"""\\.id\\s*=\\s*['\"]([^'\"]+)['\"]""", html)
    type_match = re.search(r"\\.type\\s*=\\s*'([^']+)'", html) or re.search(r'\\.type\\s*=\\s*"([^"]+)"', html) or re.search(r"""\\.type\\s*=\\s*['\"]([^'\"]+)['\"]""", html)
    
    if not (url_params_match and hash_match and id_match and type_match):
        raise ValueError("Failed to parse iframe parameters from Kodik. Stream might be offline.")
        
    try:
        url_params_str = url_params_match.group(1)
        if "'" in url_params_str and '"' not in url_params_str:
            url_params_str = url_params_str.replace("'", '"')
        url_params = json.loads(url_params_str)
    except Exception as je:
        logger.error(f"Failed to parse urlParams JSON: {je}. Raw string: {url_params_match.group(1)[:300]}")
        raise ValueError("Ошибка расшифровки внутренних параметров плеера Kodik (urlParams). Формат плеера изменился.")
        
    video_hash = hash_match.group(1)
    video_id = id_match.group(1)
    video_type = type_match.group(1)
    
    # Поиск скрипта с Gbox ajax logic
    script_url = '/assets/js/app.serial.js'
    script_urls = re.findall(r"<script\\b[^>]*?\\bsrc\\s*=\\s*[\\\"']([^\\\"']+\\.js[^\\\"']*)[\\\"']", html, re.IGNORECASE)
    asset_script = next((s for s in script_urls if '/assets/' in s), None)
    if asset_script:
        script_url = asset_script
    elif script_urls:
        script_url = script_urls[0]
        
    base_url_obj = urllib.parse.urlparse(iframe_url)
    script_absolute_url = script_url if script_url.startswith('http') else f"{base_url_obj.scheme}://{base_url_obj.netloc}{script_url}"
    
    # 3. Загружаем скрипт для парсинга AJAX пути Gbox
    req_script = urllib.request.Request(script_absolute_url, headers={'Referer': iframe_url, 'User-Agent': headers['User-Agent']})
    with urllib.request.urlopen(req_script, timeout=15) as res_script:
        script_html = res_script.read().decode('utf-8')
        
    ajax_match = re.search(r"\\$\\.ajax\\([\\s\\S]*?url:\\s*atob\\(\\\"([^\\\"]+)\\\"\\)", script_html) or re.search(r"atob\\(\\\"([^\\\"'\\(\\)]+)\\\"\\)", script_html)
    if not ajax_match:
        raise ValueError("Could not extract player API script")
        
    gbox_path = base64.b64decode(ajax_match.group(1).encode('utf-8')).decode('utf-8')
    gbox_url = f"{base_url_obj.scheme}://{base_url_obj.netloc}{gbox_path}"
    
    # 4. Запрашиваем ссылки с Gbox-сервера
    payload = {
        'hash': video_hash,
        'id': video_id,
        'type': video_type,
        'd': url_params.get('d', 'kodik.info'),
        'd_sign': url_params.get('d_sign', ''),
        'pd': url_params.get('pd', ''),
        'pd_sign': url_params.get('pd_sign', ''),
        'ref': urllib.parse.unquote(url_params.get('ref', '')),
        'ref_sign': url_params.get('ref_sign', ''),
        'bad_user': 'true',
        'cdn_is_working': 'true'
    }
    encoded_payload = urllib.parse.urlencode(payload).encode('utf-8')
    
    gbox_headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': headers['User-Agent'],
        'Referer': iframe_url
    }
    
    req_gbox = urllib.request.Request(gbox_url, data=encoded_payload, headers=gbox_headers)
    try:
        with urllib.request.urlopen(req_gbox, timeout=15) as res_gbox:
            gbox_raw = res_gbox.read().decode('utf-8')
    except Exception as re_err:
        raise ValueError(f"Сервер плеера отклонил запрос на получение видеоссылок: {re_err}")
        
    try:
        gbox_data = json.loads(gbox_raw)
    except Exception as je:
        logger.error(f"Failed to parse gbox response as JSON: {je}. Raw response: {gbox_raw[:300]}")
        if gbox_raw.strip().startswith("<"):
            raise ValueError("Kodik или Cloudflare заблокировал запрос к API плеера (возвращена HTML-страница). Попробуйте позже.")
        raise ValueError(f"Сервер Kodik вернул поврежденные данные вместо списка серий: {gbox_raw[:100]}")
        
    if not gbox_data or not gbox_data.get('links'):
        raise ValueError(f"Kodik gbox API returned empty links: {gbox_data}")
        
    links_dict = gbox_data['links']
    processed_links = {}
    for q in links_dict.keys():
        list_sources = links_dict[q]
        if list_sources and len(list_sources) > 0:
            raw_src = list_sources[0]['src']
            decrypted_url = raw_src if (raw_src.startswith('http') or raw_src.startswith('//') or 'mp4:hls:manifest' in raw_src) else decode_kodik_url(raw_src)
            direct_url = decrypted_url if decrypted_url.startswith('http') else "https:" + decrypted_url
            
            proxied_m3u8 = f"{WEB_APP_URL.rstrip('/')}/api/media/playlist?url={urllib.parse.quote(iframe_url)}&quality={q}" if is_valid_url(WEB_APP_URL) else direct_url
            
            processed_links[q] = [{
                "src": proxied_m3u8,
                "direct_src": direct_url
            }]
    links_dict = processed_links

    available_qualities = sorted([int(k) for k in links_dict.keys()], reverse=True)
    if not available_qualities:
        raise ValueError("No video stream found for any quality.")
        
    return available_qualities, links_dict

async def set_url(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    Команда /seturl <url> для мгновенной привязки бота к сайту.
    """
    if not context.args:
        await update.message.reply_text(
            "✍️ **Укажите адрес вашего сайта!**\\n\\n"
            "Пример:\\n"
            "**/seturl https://kamianime.club**\\n\\n"
            "Бот мгновенно переключится на дешифратор этого сайта без необходимости редактировать файлы или перезапускать Space.",
            parse_mode="Markdown"
        )
        return

    url = context.args[0].strip().rstrip('/')
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url

    # Сохраняем в кэш в памяти
    global WEB_APP_URL, _cached_url
    WEB_APP_URL = url
    _cached_url = url
    logger.info(f"Команда /seturl: установлен URL {url}")

    # Пытаемся записать во все возможные пути для надежности сохранения
    errors = []
    success_paths = []
    for path in get_possible_txt_paths():
        try:
            # Создаем родительские папки, если нужно
            parent = os.path.dirname(path)
            if parent and not os.path.exists(parent):
                os.makedirs(parent, exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                f.write(url)
            success_paths.append(path)
        except Exception as e:
            errors.append(f"{path}: {str(e)}")

    if success_paths:
        logger.info(f"URL успешно записан в файлы: {success_paths}")
        await update.message.reply_text(
            f"✅ **Бот успешно привязан к сайту!**\\n\\n"
            f"🔗 Адрес сайта: **{url}**\\n\\n"
            f"Дешифрование Kodik будет автоматически проходить через этот сайт для обхода лимитов и блокировок.\\n"
            f"*(Сохранено в {len(success_paths)} локациях на сервере)*",
            parse_mode="Markdown"
        )
    else:
        logger.error(f"Не удалось сохранить URL в файлы: {errors}")
        await update.message.reply_text(
            f"⚠️ **Адрес установлен в памяти бота, но не удалось записать его на диск для автозапуска:**\\n"
            f"Адрес сайта: **{url}**\\n"
            f"Ошибки записи: {', '.join(errors)}",
            parse_mode="Markdown"
        )

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    Обработка команды /start
    Поддерживает deep-links формата: dl_<id>_ep<серия>_tr<озвучка>
    """
    args = context.args
    if not args:
        await update.message.reply_text(
            "👋 **Привет! Я бот для загрузки аниме с KamiAnime!**\\n\\n"
            "Перейдите на сайт, выберите тайтл, нажмите кнопку **«Скачать в Telegram»**, "
            "и я автоматически пришлю готовый видеофайл в выбранной вами озвучке!",
            parse_mode="Markdown"
        )
        return

    param = args[0]
    if param.startswith("dl_"):
        parts = param.split("_")
        anime_id = parts[1]
        
        episode = "1"
        translation_id = "0"
        
        for part in parts[2:]:
            if part.startswith("ep"):
                episode = part.replace("ep", "")
            elif part.startswith("tr"):
                translation_id = part.replace("tr", "")

        status_msg = await update.message.reply_text(
            "⏳ **Поиск информации о тайтле на серверах...**",
            parse_mode="Markdown"
        )
        
        try:
            info = make_kodik_api_request(anime_id)
            
            if not info or not info.get("results"):
                await status_msg.edit_text("❌ К сожалению, аниме не найдено на сервере.")
                return
                
            # Ищем нужную озвучку (translation)
            matching_item = None
            if translation_id and translation_id != "0":
                for item in info["results"]:
                    if "translation" in item and str(item["translation"].get("id")) == str(translation_id):
                        matching_item = item
                        break
            
            if not matching_item:
                matching_item = info["results"][0]
                
            anime_title = matching_item.get("material_data", {}).get("title", "Аниме")
            translation_title = matching_item.get("translation", {}).get("title", "Стандартная озвучка")
            
            # Подготовка клавиш выбора качества (360p, 480p, 720p)
            keyboard = [
                [
                    InlineKeyboardButton("🟢 360p (SD качество)", callback_data=f"q_{anime_id}_{episode}_{translation_id}_360"),
                    InlineKeyboardButton("🔵 480p (HQ качество)", callback_data=f"q_{anime_id}_{episode}_{translation_id}_480"),
                    InlineKeyboardButton("🔥 720p (HD качество)", callback_data=f"q_{anime_id}_{episode}_{translation_id}_720")
                ],
                [
                    InlineKeyboardButton("🪐 На сайт KamiAnime", url="https://shikimori.one")
                ]
            ]
            
            reply_markup = InlineKeyboardMarkup(keyboard)
            text = (
                f"🎬 **Найдено аниме!**\\n\\n"
                f"• 📌 **Название:** {anime_title}\\n"
                f"• 🎙️ **Озвучка:** {translation_title}\\n"
                f"• 💿 **Серия:** {episode}\\n\\n"
                f"Выберите желаемое качество видео ниже:"
            )
            
            await status_msg.delete()
            await update.message.reply_text(
                text,
                reply_markup=reply_markup,
                parse_mode="Markdown"
            )
            
        except Exception as e:
            logger.error(f"Start error: {e}")
            await status_msg.edit_text(f"❌ Возникла непредвиденная ошибка: {str(e)}")

# Вспомогательные функции для быстрого параллельного скачивания HLS и отложенного удаления файлов
async def delay_delete(filepath: str, delay_seconds: int = 7200):
    await asyncio.sleep(delay_seconds)
    try:
        if os.path.exists(filepath):
            os.remove(filepath)
            logger.info(f"Отложенное удаление временного файла завершено: {filepath}")
    except Exception as e:
        logger.error(f"Ошибка при отложенном удалении файла {filepath}: {e}")

def fetch_m3u8_segments(playlist_url: str, headers: dict) -> list:
    req = urllib.request.Request(playlist_url, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as response:
        content = response.read().decode('utf-8')
    
    lines = content.splitlines()
    segments = []
    
    # Check if it's a master playlist or variant/media playlist
    is_master = any("#EXT-X-STREAM-INF" in line for line in lines)
    if is_master:
        # Find the first variant playlist URL
        variant_url = None
        for i, line in enumerate(lines):
            if "#EXT-X-STREAM-INF" in line:
                for j in range(i + 1, len(lines)):
                    candidate = lines[j].strip()
                    if candidate and not candidate.startswith("#"):
                        variant_url = urllib.parse.urljoin(playlist_url, candidate)
                        break
                if variant_url:
                    break
        if variant_url:
            return fetch_m3u8_segments(variant_url, headers)
        else:
            raise ValueError("No variant playlist found in master playlist")
            
    # It's a media playlist containing segments
    for line in lines:
        line = line.strip()
        if line and not line.startswith("#"):
            segment_url = urllib.parse.urljoin(playlist_url, line)
            segments.append(segment_url)
            
    return segments

async def download_hls_stream_fast(playlist_url: str, output_filename: str, status_msg=None) -> bool:
    from concurrent.futures import ThreadPoolExecutor
    import shutil
    import time
    
    headers = {
        "Referer": "https://kodik.info/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    try:
        segments = await asyncio.to_thread(fetch_m3u8_segments, playlist_url, headers)
        if not segments:
            raise ValueError("No segments found in the HLS playlist")
            
        total_segments = len(segments)
        logger.info(f"Найдено {total_segments} сегментов для скачивания.")
        
        # Создаем временную директорию для сегментов
        temp_dir = os.path.join(os.path.dirname(os.path.abspath(output_filename)), f"temp_hls_{int(time.time())}")
        os.makedirs(temp_dir, exist_ok=True)
        
        # Для отслеживания прогресса
        downloaded_count = [0]
        
        def download_single(segment_url: str, idx: int):
            seg_path = os.path.join(temp_dir, f"segment_{idx:05d}.ts")
            
            # Попытки скачивания с ретраями
            for attempt in range(4):
                try:
                    req = urllib.request.Request(segment_url, headers={
                        "Referer": headers["Referer"],
                        "User-Agent": headers["User-Agent"]
                    })
                    with urllib.request.urlopen(req, timeout=12) as response:
                        with open(seg_path, "wb") as f:
                            f.write(response.read())
                    downloaded_count[0] += 1
                    
                    # Логируем каждые 50 сегментов
                    if downloaded_count[0] % 50 == 0 or downloaded_count[0] == total_segments:
                        logger.info(f"Скачано {downloaded_count[0]}/{total_segments} сегментов")
                    return True
                except Exception as e:
                    if attempt == 3:
                        logger.error(f"Не удалось скачать сегмент {idx} ({segment_url}) после попыток: {e}")
                        raise e
                    time.sleep(1 + attempt)
            return False

        if status_msg:
            try:
                await status_msg.edit_text(
                    f"⏳ **Готовим файл к скачиванию, подождите 30 секунд...**",
                    parse_mode="Markdown"
                )
            except:
                pass

        # Скачиваем параллельно в 24 потока
        with ThreadPoolExecutor(max_workers=24) as executor:
            futures = [executor.submit(download_single, url, i) for i, url in enumerate(segments)]
            # Ожидаем завершения всех потоков в асинхронном режиме
            await asyncio.to_thread(lambda: [f.result() for f in futures])

        if status_msg:
            try:
                await status_msg.edit_text(
                    f"⚙️ **Завершаем подготовку файла...**",
                    parse_mode="Markdown"
                )
            except:
                pass

        # Объединяем сегменты в один временный .ts файл
        combined_ts = os.path.join(temp_dir, "combined.ts")
        with open(combined_ts, "wb") as outfile:
            for i in range(total_segments):
                seg_path = os.path.join(temp_dir, f"segment_{i:05d}.ts")
                if os.path.exists(seg_path):
                    with open(seg_path, "rb") as infile:
                        outfile.write(infile.read())
                    # Удаляем кусок для экономии места сразу
                    os.remove(seg_path)

        # Быстро пакуем в mp4 с помощью FFmpeg (-c copy)
        packaging_cmd = [
            "ffmpeg", "-y",
            "-i", combined_ts,
            "-c", "copy",
            "-bsf:a", "aac_adtstoasc",
            output_filename
        ]
        
        process = await asyncio.to_thread(subprocess.run, packaging_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        
        # Удаляем временную папку
        try:
            shutil.rmtree(temp_dir)
        except:
            pass
            
        if os.path.exists(output_filename) and os.path.getsize(output_filename) > 0:
            logger.info(f"Файл успешно создан: {output_filename}")
            return True
        else:
            logger.error(f"Упаковка в MP4 прервалась: {process.stderr}")
            return False
            
    except Exception as e:
        logger.error(f"Ошибка при быстром скачивании HLS: {e}")
        return False

async def button_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    Обработчик кнопок качества (q_...)
    """
    query = update.callback_query
    await query.answer()
    
    data = query.data
    if data.startswith("q_"):
        parts = data.split("_")
        anime_id = parts[1]
        episode = parts[2]
        translation_id = parts[3]
        quality = parts[4]
        
        # Убираем кнопки качества сразу, чтобы предотвратить повторные нажатия
        try:
            await query.edit_message_reply_markup(reply_markup=None)
        except Exception as edit_err:
            logger.warning(f"Failed to clear reply markup: {edit_err}")
            
        status_msg = await query.message.reply_text(
            "⏳ **Готовим файл к скачиванию, подождите 30 секунд...**",
            parse_mode="Markdown"
        )

        try:
            info = make_kodik_api_request(anime_id)
            
            if not info or not info.get("results"):
                await status_msg.edit_text("❌ Видеопоток не найден на серверах.")
                return

            # Находим подходящую озвучку
            matching_item = None
            if translation_id and translation_id != "0":
                for item in info["results"]:
                    if "translation" in item and str(item["translation"].get("id")) == str(translation_id):
                        matching_item = item
                        break
            
            if not matching_item:
                matching_item = info["results"][0]

            link = matching_item["link"]
            if not link.startswith("http"):
                link = "https:" + link if link.startswith("//") else link

            # Подстановка серии в плеер, если сериал
            if episode and episode != "all" and episode != "None":
                sep = "&" if "?" in link else "?"
                link = f"{link}{sep}episode={episode}"

            # 2. Дешифрование потока через бэкенд-парсер
            pass
            
            available_quals, links_dict = extract_m3u8_stream(link, quality)
            
            selected_qual_str = str(quality)
            if selected_qual_str not in links_dict:
                selected_qual_str = str(available_quals[0])
                
            stream_item = links_dict[selected_qual_str][0]
            
            # Мы предпочитаем прямой URL-адрес от CDN Kodik для FFmpeg на сервере бота (direct_src),
            # чтобы скачивание происходило мгновенно на гигабитной скорости без тройного прокси через наш Express API.
            direct_src = stream_item.get("direct_src", "")
            proxied_src = stream_item.get("src", "")
            
            playlist_url = direct_src if direct_src else proxied_src
            if playlist_url.startswith("//"):
                playlist_url = "https:" + playlist_url
                
            backup_playlist_url = proxied_src if proxied_src else playlist_url
            if backup_playlist_url.startswith("//"):
                backup_playlist_url = "https:" + backup_playlist_url

            # 3. Склеивание потока через FFmpeg
            pass

            filename_base = f"anime_{anime_id}_ep_{episode}_{quality}p.mp4"
            output_filename = os.path.join(DOWNLOADS_DIR, filename_base)
            if os.path.exists(output_filename):
                try:
                    os.remove(output_filename)
                except:
                    pass

            # 3. Склеивание потока через быстрое параллельное скачивание с ретраями
            filename_base = f"anime_{anime_id}_ep_{episode}_{quality}p.mp4"
            output_filename = os.path.join(DOWNLOADS_DIR, filename_base)
            if os.path.exists(output_filename):
                try:
                    os.remove(output_filename)
                except:
                    pass

            success = await download_hls_stream_fast(playlist_url, output_filename, status_msg)
            
            # Если быстрое скачивание не удалось (редко, например из-за кастомного m3u8), откатываемся на стандартный ffmpeg
            if not success or not os.path.exists(output_filename) or os.path.getsize(output_filename) == 0:
                logger.warning("Быстрое скачивание не удалось. Пытаемся запустить стандартный FFmpeg...")
                await status_msg.edit_text(
                    f"⚙️ **Сборка файла... Пожалуйста, подождите немного больше обычного...**",
                    parse_mode="Markdown"
                )
                
                cmd = [
                    "ffmpeg", "-y",
                    "-headers", "Referer: https://kodik.info/\\r\\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\\r\\n",
                    "-http_persistent", "1",
                    "-reconnect", "1",
                    "-reconnect_at_eof", "1",
                    "-reconnect_streamed", "1",
                    "-reconnect_delay_max", "5",
                    "-i", playlist_url,
                    "-c", "copy",
                    "-bsf:a", "aac_adtstoasc",
                    output_filename
                ]
                
                logger.info(f"Запуск стандартного FFmpeg со ссылкой {playlist_url}")
                process = await asyncio.to_thread(subprocess.run, cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=600)
                
                if (not os.path.exists(output_filename) or os.path.getsize(output_filename) == 0) and playlist_url != backup_playlist_url:
                    logger.warning(f"Прямое скачивание FFmpeg не удалось. Пробуем скачать через прокси сайта: {backup_playlist_url}")
                    cmd_backup = cmd.copy()
                    try:
                        p_idx = cmd_backup.index(playlist_url)
                        cmd_backup[p_idx] = backup_playlist_url
                    except ValueError:
                        pass
                    process = await asyncio.to_thread(subprocess.run, cmd_backup, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=600)
                
                if not os.path.exists(output_filename) or os.path.getsize(output_filename) == 0:
                    raise RuntimeError(f"FFmpeg failed: {process.stderr or process.stdout}")

            file_size = os.path.getsize(output_filename)
            file_size_mb = file_size / (1024 * 1024)

            # Если файл превышает 48 МБ (лимит Telegram), мы разделяем его без потери качества
            if file_size > 48 * 1024 * 1024:
                try:
                    # 1. Измеряем длительность видео через ffprobe
                    duration = 1440.0
                    try:
                        probe_cmd = [
                            "ffprobe", "-v", "error", "-show_entries", "format=duration",
                            "-of", "default=noprint_wrappers=1:noclose=1", output_filename
                        ]
                        p_dur = await asyncio.to_thread(subprocess.run, probe_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                        if p_dur.returncode == 0 and p_dur.stdout.strip():
                            duration = float(p_dur.stdout.strip())
                    except Exception as pe:
                        logger.error(f"Ffprobe error: {pe}")

                    import math
                    import glob
                    
                    target_size = 30 * 1024 * 1024  # Более безопасный размер целевой части (30 MB) во избежание овершутинга из-за ключевых кадров
                    num_parts = math.ceil(file_size / target_size)
                    segment_time = duration / num_parts

                    await status_msg.edit_text(
                        f"⏳ **Готовим файл к скачиванию, подождите 30 секунд...**",
                        parse_mode="Markdown"
                    )

                    parts_pattern = f"part_%03d_{output_filename}"
                    split_cmd = [
                        "ffmpeg", "-y",
                        "-i", output_filename,
                        "-c", "copy",
                        "-map", "0",
                        "-segment_time", str(segment_time),
                        "-f", "segment",
                        "-reset_timestamps", "1",
                        parts_pattern
                    ]
                    
                    split_process = await asyncio.to_thread(subprocess.run, split_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                    part_files = sorted(glob.glob(f"part_*_{output_filename}"))
                    
                    if len(part_files) > 0:
                        space_id = os.getenv("SPACE_ID", "")
                        space_host = os.getenv("SPACE_HOST", "")
                        download_text = ""
                        
                        if space_host or space_id:
                            if space_host:
                                download_url = f"https://{space_host}/download/{filename_base}"
                            else:
                                subdomain = space_id.replace("/", "-").lower()
                                download_url = f"https://{subdomain}.hf.space/download/{filename_base}"
                            
                            download_text = (
                                f"🔗 **[Скачать файл]({download_url})**\\n\\n"
                                f"*Файл хранится 2 часа*"
                            )
                        
                        header_text = (
                            f"🍿 **Аниме готово для скачивания!**\\n\\n"
                            f"{download_text}"
                        )
                        await status_msg.edit_text(header_text, parse_mode="Markdown", disable_web_page_preview=True)
                        
                        for idx, part_file in enumerate(part_files):
                            part_size = os.path.getsize(part_file)
                            part_size_mb = part_size / (1024 * 1024)
                            
                            # На случай овершутинга отдельного куска свыше 49 МБ - сожмем его до 35 МБ
                            if part_size > 49 * 1024 * 1024:
                                logger.warning(f"Кусок {part_file} весит {part_size_mb:.1f} MB (превышает лимит). Пытаемся быстро поджать под 35MB...")
                                part_compress_name = f"comp_{part_file}"
                                part_duration = segment_time
                                target_bytes_part = 35 * 1024 * 1024
                                part_total_bitrate = (target_bytes_part * 8) / part_duration
                                part_audio_bitrate = 64000
                                part_video_bitrate = max(120000, part_total_bitrate - part_audio_bitrate)
                                
                                part_compress_cmd = [
                                    "ffmpeg", "-y",
                                    "-i", part_file,
                                    "-b:v", f"{int(part_video_bitrate)}",
                                    "-maxrate", f"{int(part_video_bitrate * 1.5)}",
                                    "-bufsize", f"{int(part_video_bitrate * 2)}",
                                    "-c:v", "libx264",
                                    "-preset", "veryfast",
                                    "-c:a", "aac",
                                    "-b:a", f"{int(part_audio_bitrate)}",
                                    part_compress_name
                                ]
                                await asyncio.to_thread(subprocess.run, part_compress_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                                if os.path.exists(part_compress_name) and os.path.getsize(part_compress_name) > 0:
                                    os.remove(part_file)
                                    os.rename(part_compress_name, part_file)
                                    part_size = os.path.getsize(part_file)
                                    part_size_mb = part_size / (1024 * 1024)

                            await query.message.reply_chat_action("upload_video")
                            with open(part_file, "rb") as pf:
                                await query.message.reply_video(
                                    video=pf,
                                    filename=os.path.basename(part_file),
                                    caption=(
                                        f"🎞️ **Часть {idx+1} из {len(part_files)}** ({part_size_mb:.1f} MB)\\n\\n"
                                        f"• **Серия:** {episode}\\n"
                                        f"• **Качество:** {quality}p (без сжатия!)"
                                    ),
                                    supports_streaming=True
                                )
                            try:
                                os.remove(part_file)
                            except:
                                pass
                        
                        try:
                            # Оставляем оригинальный целый MP4 файл на диске на 2 часа для прямой загрузки по ссылке
                            asyncio.create_task(delay_delete(output_filename, 7200))
                        except Exception as de_err:
                            logger.error(f"Failed to schedule delay delete: {de_err}")
                        return
                    else:
                        raise RuntimeError(f"FFmpeg segmentation returned no files: {split_process.stderr}")
                        
                except Exception as ex:
                    logger.error(f"Lossless splitting failed: {ex}. Falling back to compression...")
                    try:
                        await status_msg.edit_text(
                            f"⚠️ Не удалось нарезать файл без потери качества. Запускаем сжатие до 35MB...",
                            parse_mode="Markdown"
                        )
                        # 2. Вычисляем битрейт под безопасный размер 35MB
                        target_bytes = 35 * 1024 * 1024
                        total_bitrate_bps = (target_bytes * 8) / duration
                        audio_bitrate_bps = 64000
                        video_bitrate_bps = total_bitrate_bps - audio_bitrate_bps
                        
                        if video_bitrate_bps < 120000:
                            video_bitrate_bps = 120000
                            
                        compressed_filename = f"compressed_{output_filename}"
                        if os.path.exists(compressed_filename):
                            try:
                                os.remove(compressed_filename)
                            except:
                                pass
                                
                        compress_cmd = [
                            "ffmpeg", "-y",
                            "-i", output_filename,
                            "-b:v", f"{int(video_bitrate_bps)}",
                            "-maxrate", f"{int(video_bitrate_bps * 1.5)}",
                            "-bufsize", f"{int(video_bitrate_bps * 2)}",
                            "-c:v", "libx264",
                            "-preset", "veryfast",
                            "-c:a", "aac",
                            "-b:a", f"{int(audio_bitrate_bps)}",
                            compressed_filename
                        ]
                        
                        await asyncio.to_thread(subprocess.run, compress_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                        if os.path.exists(compressed_filename) and os.path.getsize(compressed_filename) > 0:
                            os.remove(output_filename)
                            os.rename(compressed_filename, output_filename)
                            file_size = os.path.getsize(output_filename)
                            file_size_mb = file_size / (1024 * 1024)
                    except Exception as ce:
                        logger.error(f"Compression fallback failed: {ce}")

            file_size = os.path.getsize(output_filename)
            file_size_mb = file_size / (1024 * 1024)

            await status_msg.edit_text(
                "⏳ **Готовим файл к скачиванию, подождите 30 секунд...**",
                parse_mode="Markdown"
            )

            # Отправка файла видео, если он влезает в лимит бота (50MB)
            if file_size <= 50 * 1024 * 1024:
                download_text = ""
                space_id = os.getenv("SPACE_ID", "")
                space_host = os.getenv("SPACE_HOST", "")
                if space_host or space_id:
                    if space_host:
                        download_url = f"https://{space_host}/download/{filename_base}"
                    else:
                        subdomain = space_id.replace("/", "-").lower()
                        download_url = f"https://{subdomain}.hf.space/download/{filename_base}"
                    download_text = (
                        f"🔗 **[Скачать файл]({download_url})**\\n\\n"
                        f"*Файл хранится 2 часа*"
                    )
                
                await query.message.reply_chat_action("upload_video")
                with open(output_filename, "rb") as video_file:
                    await query.message.reply_video(
                        video=video_file,
                        filename=output_filename,
                        caption=(
                            f"🍿 **Аниме готово для скачивания!**\\n\\n"
                            f"{download_text}" if download_text else f"🍿 **Аниме готово для скачивания!**"
                        ),
                        supports_streaming=True
                    )
                await status_msg.delete()
                # Удаляем временный файл для экономии диска отложенно на 2 часа, чтобы ссылка на скачивание в браузере работала
                if space_host or space_id:
                    try:
                        asyncio.create_task(delay_delete(output_filename, 7200))
                    except Exception as de_err:
                        logger.error(f"Failed to schedule delay delete: {de_err}")
                else:
                    try:
                        os.remove(output_filename)
                    except:
                        pass
            else:
                # Если файл слишком большой, отдаем прямую ссылку с Hugging Face Spaces
                space_id = os.getenv("SPACE_ID", "")
                space_host = os.getenv("SPACE_HOST", "")
                
                if space_host or space_id:
                    if space_host:
                        download_url = f"https://{space_host}/download/{filename_base}"
                    else:
                        subdomain = space_id.replace("/", "-").lower()
                        download_url = f"https://{subdomain}.hf.space/download/{filename_base}"
                    
                    await status_msg.edit_text(
                        f"🍿 **Аниме готово для скачивания!**\\n\\n"
                        f"🔗 **[Скачать файл]({download_url})**\\n\\n"
                        f"*Файл хранится 2 часа*",
                        parse_mode="Markdown"
                    )
                    
                    try:
                        asyncio.create_task(delay_delete(output_filename, 7200))
                    except Exception as de_err:
                        logger.error(f"Failed to schedule delay delete: {de_err}")
                else:
                    await status_msg.edit_text(
                        f"⚠️ **Файл слишком большой ({file_size_mb:.1f} MB)** и превышает лимит отправки в Telegram.\n\n"
                        f"Пожалуйста, выберите более низкое качество видео (например, 480p или 360p), чтобы скачать его прямо здесь, или воспользуйтесь сайтом."
                    )

        except Exception as e:
            logger.error(f"Error in callback: {e}")
            import html
            safe_err = html.escape(str(e))
            err_text = (
                f"❌ <b>Возникла ошибка при обработке или скачивании:</b>\\n"
                f"<code>{safe_err}</code>\\n\\n"
                f"Попробуйте выбрать другое качество или серию!"
            )
            await status_msg.edit_text(err_text, parse_mode="HTML")

# Запуск нативного Gradio интерфейса для прохождения проверок Hugging Face Spaces
def run_health_server():
    try:
        # Устанавливаем переменную окружения разрешенных путей Gradio
        cwd = os.path.abspath(".")
        os.environ["GRADIO_ALLOWED_PATHS"] = cwd
        logger.info(f"Настройка GRADIO_ALLOWED_PATHS: {cwd}")
        
        with gr.Blocks(title="KamiAnime Bot Dashboard", theme=gr.themes.Soft()) as demo:
            gr.Markdown(
                """
                # 🍿 KamiAnime Telegram Bot
                ### 🚀 Бот успешно запущен и работает в Hugging Face Spaces!
                
                Этот Space служит надежным облачным бэкендом для вашего Telegram-бота. 
                
                ---
                ### ⚙️ Текущий статус систем:
                - **Бот (python-telegram-bot)**: Активен (ожидает команды '/start' от пользователя)
                - **Веб-интерфейс (Gradio)**: Успешно запущен на порту 7860
                - **Склейка потоков (FFmpeg)**: Активна (файлы нарезаются без потери качества)
                - **Прямые ссылки для скачивания**: Генерируются автоматически в диалоге с ботом через '/file=...'
                """
            )
        demo.launch(
            server_name="0.0.0.0", 
            server_port=7860, 
            prevent_thread_lock=True, 
            show_api=False,
            allowed_paths=[cwd]
        )
        print("Gradio запущен на порту 7860")
        
        # Интегрируем роут скачивания через FastAPI (Gradio app)
        if hasattr(demo, "app") and demo.app:
            from fastapi.responses import FileResponse
            from fastapi import HTTPException
            
            @demo.app.get("/download/{filename}")
            async def download_file(filename: str):
                # Защита от выхода из директории (path traversal)
                if os.path.basename(filename) != filename or ".." in filename or not filename.endswith(".mp4"):
                    raise HTTPException(status_code=403, detail="Invalid filename format or access denied")
                
                cwd = os.path.abspath(".")
                script_dir = os.path.dirname(os.path.abspath(__file__))
                parent_dir = os.path.dirname(script_dir)
                
                paths_to_try = [
                    os.path.join(DOWNLOADS_DIR if 'DOWNLOADS_DIR' in globals() else cwd, filename),
                    os.path.join(cwd, filename),
                    os.path.join(script_dir, filename),
                    os.path.join(parent_dir, filename),
                    os.path.join("/tmp", filename)
                ]
                
                safe_path = None
                for path in paths_to_try:
                    abs_path = os.path.abspath(path)
                    logger.info(f"Checking download path: {abs_path}")
                    if os.path.exists(abs_path) and os.path.isfile(abs_path):
                        safe_path = abs_path
                        break
                
                if not safe_path:
                    try:
                        logger.error(f"File not found in any path for: {filename}.")
                        logger.error(f"Current working dir: {cwd}. Files: {os.listdir(cwd)}")
                        logger.error(f"Script dir: {script_dir}. Files: {os.listdir(script_dir)}")
                    except Exception as le:
                        logger.error(f"Logging file list error: {le}")
                    raise HTTPException(status_code=404, detail="File not found")
                    
                # Заставляем браузер скачивать файл сразу с оригинальным наименованием (как attachment)
                headers = {
                    "Content-Disposition": f'attachment; filename="{filename}"'
                }
                return FileResponse(path=safe_path, filename=filename, media_type="video/mp4", headers=headers)
                
            logger.info("Роут /download успешно внедрен в FastAPI.")
    except Exception as ge:
        print(f"Gradio launch failed: {ge}")

# Настройка файловой блокировки для избежания повторного запуска polling в Hugging Face (409 Conflict)
import tempfile
import time

_lock_file = None

def acquire_bot_lock():
    global _lock_file
    lock_path = os.path.join(tempfile.gettempdir(), "kamianime_bot.lock")
    try:
        _lock_file = open(lock_path, "w")
        import fcntl
        fcntl.flock(_lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        logger.info("Успешно захвачена файловая блокировка бота. Запускаем polling...")
        return True
    except Exception as e:
        logger.warning(f"Пропускаем повторный запуск polling, так как бот уже активен в другом процессе: {e}")
        return False

def main():
    if not API_TOKEN or API_TOKEN == "YOUR_BOT_TOKEN_HERE":
        print("TELEGRAM_BOT_TOKEN не задан. Бот завершает работу.")
        sys.exit(1)
        
    # Запускаем Gradio-сервер
    run_health_server()
        
    # Проверяем файловую блокировку перед запуском polling
    if not acquire_bot_lock():
        print("Активный инстанс бота уже запущен. Этот процесс спит, обслуживая Gradio веб-интерфейс.")
        while True:
            time.sleep(3600)

    # Настройка прокси/зеркала Telegram API
    base_url = os.getenv("TELEGRAM_BASE_URL", "https://api.telegram.org/bot")
    if base_url and not base_url.endswith("/bot"):
        base_url = base_url.rstrip("/") + "/bot"
        
    request_config = HTTPXRequest(
        connect_timeout=45.0,
        read_timeout=45.0,
        write_timeout=45.0
    )
    
    app = Application.builder().token(API_TOKEN).base_url(base_url).request(request_config).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("seturl", set_url))
    app.add_handler(CallbackQueryHandler(button_callback))
    
    print("KamiAnime Телеграм Бот успешно запущен!")
    app.run_polling(drop_pending_updates=True)

if __name__ == '__main__':
    main()
`
