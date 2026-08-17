package com.kamianime.sdk

import com.google.gson.Gson
import com.google.gson.annotations.SerializedName
import okhttp3.OkHttpClient
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.*

/**
 * 🪐 KAMI ANIME SDK - ARCHITECTURE & NETWORKING INTEGRATION FOR KOTLIN (ANDROID)
 *
 * This SDK contains the complete data structures, Retrofit API endpoints,
 * a dynamic Cloudflare D1 Query Builder, Media3 ExoPlayer setup, and
 * WebSocket Co-Watching room synchronization models.
 *
 * Feed this file directly to your Android AI dev model so it can copy the
 * classes and immediately write robust code integrated with your backend.
 */

// =========================================================================
// 1. RETROFIT API CLIENT INTERFACE
// =========================================================================

interface KamiAnimeApiService {

    /**
     * Получить доступные озвучки и видео-плееры по Shikimori ID
     */
    @GET("api/balancer")
    suspend fun getBalancer(
        @Query("shikimori_id") shikimoriId: String,
        @Query("title") title: String? = null,
        @Query("year") year: Int? = null
    ): Response<BalancerResponse>

    /**
     * Декриптовать iframe во встречные HLS стримы (.m3u8) для нативного ExoPlayer
     */
    @GET("api/media/playlist")
    suspend fun getPlaylist(
        @Query("url") iframeUrl: String
    ): Response<PlaylistResponse>

    /**
     * Отправить сообщение ИИ-рекомендателюKamiAnime (на базе Gemini)
     * В ответе ссылки приходят как [Русское имя](/anime/ID).
     */
    @POST("api/ai/recommend")
    suspend fun getAiRecommendation(
        @Body request: AIRequest
    ): Response<AIResponse>

    /**
     * Универсальный CRUD-шлюз базы данных Cloudflare D1
     */
    @POST("api/db/query")
    suspend fun executeDbQuery(
        @Body request: DbQueryRequest
    ): Response<DbQueryResponse>

    /**
     * Начать фоновую конвертацию HLS-видео в MP4 на сервере
     */
    @GET("api/media/download/start")
    suspend fun startDownloadTask(
        @Query("url") iframeUrl: String,
        @Query("quality") quality: String = "720",
        @Query("title") title: String? = null,
        @Query("episode") episode: String? = null
    ): Response<DownloadStartResponse>

    /**
     * Проверить текущий прогресс/статус сборки MP4 по ID задачи
     */
    @GET("api/media/download/progress")
    suspend fun getDownloadProgress(
        @Query("taskId") taskId: String
    ): Response<DownloadProgressResponse>

    /**
     * Получить ссылку на скачивание MP4 файла
     * Полезно скормить в Android DownloadManager:
     * GET https://{your_domain}/api/media/download/file?taskId={taskId}
     */
    @GET("api/media/download/file")
    @Streaming
    suspend fun downloadFinishedFile(
        @Query("taskId") taskId: String
    ): Response<okhttp3.ResponseBody>
}

// =========================================================================
// 2. СЕТЕВЫЕ МОДЕЛИ ДАННЫХ (DTO) И СЕРИАЛИЗАЦИЯ
// =========================================================================

data class BalancerResponse(
    @SerializedName("shikimori_id") val shikimoriId: String,
    @SerializedName("kinopoisk_id") val kinopoiskId: String?,
    @SerializedName("translations") val translations: List<Translation>
)

data class Translation(
    @SerializedName("id") val id: Int,
    @SerializedName("title") val title: String, // Студия (например: AniLibria, Studio Band, Субтитры)
    @SerializedName("type") val type: String,   // "voice" | "subtitles"
    @SerializedName("iframe") val iframe: String // iframe-ссылка для парсинга
)

data class PlaylistResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("links") val links: Map<String, List<HlsStream>> // Ключи: "360", "480", "720", "1080"
)

data class HlsStream(
    @SerializedName("src") val src: String, // Нативный m3u8 урл, ведущий на сегмент-прокси
    @SerializedName("type") val type: String // "application/x-mpegURL"
)

data class AIRequest(
    @SerializedName("messages") val messages: List<AIMessage>
)

data class AIMessage(
    @SerializedName("role") val role: String, // "user" | "assistant" | "system"
    @SerializedName("content") val content: String
)

data class AIResponse(
    @SerializedName("text") val text: String // Markdown-ответ с тегами [Название](/anime/ID)
)

data class DownloadStartResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("taskId") val taskId: String,
    @SerializedName("fileName") val fileName: String
)

data class DownloadProgressResponse(
    @SerializedName("id") val id: String,
    @SerializedName("stage") val stage: String, // "resolving" | "downloading" | "muxing" | "completed" | "failed"
    @SerializedName("processed") val processed: Int,
    @SerializedName("total") val total: Int,
    @SerializedName("progress") val progress: Float, // Процент прогресса от 0.0 до 100.0
    @SerializedName("status") val status: String,   // "running" | "completed" | "failed"
    @SerializedName("error") val error: String?,
    @SerializedName("fileName") val fileName: String
)

// =========================================================================
// 3. СТРУКТУРА ТАБЛИЦ БАЗЫ ДАННЫХ D1 (MAPPED TO KOTLIN MODELS)
// =========================================================================

data class Profile(
    @SerializedName("id") val id: String,
    @SerializedName("email") val email: String?,
    @SerializedName("name") val name: String?,
    @SerializedName("avatar") val avatar: String?,
    @SerializedName("bio") val bio: String?,
    @SerializedName("is_premium") val isPremium: Boolean,
    @SerializedName("theme_color") val themeColor: String?,
    @SerializedName("card_bg") val cardBg: String?,
    @SerializedName("watched_anime_ids") val watchedAnimeIds: String = "[]", // Хранится как JSON String "[ID, ID]"
    @SerializedName("watching_anime_ids") val watchingAnimeIds: String = "[]",
    @SerializedName("dropped_anime_ids") val droppedAnimeIds: String = "[]"
)

data class Comment(
    @SerializedName("id") val id: String?,
    @SerializedName("target_id") val targetId: String, // Shikimori ID
    @SerializedName("user_name") val userName: String?,
    @SerializedName("user_avatar") val userAvatar: String?,
    @SerializedName("text") val text: String,
    @SerializedName("created_at") val createdAt: String?
)

data class Review(
    @SerializedName("id") val id: String?,
    @SerializedName("anime_id") val animeId: String,
    @SerializedName("user_email") val userEmail: String,
    @SerializedName("content") val content: String,
    @SerializedName("rating_plot") val ratingPlot: Int = 0,
    @SerializedName("rating_sound") val ratingSound: Int = 0,
    @SerializedName("rating_visuals") val ratingVisuals: Int = 0,
    @SerializedName("rating_overall") val ratingOverall: Int = 0,
    @SerializedName("created_at") val createdAt: String?
)

data class Club(
    @SerializedName("id") val id: String?,
    @SerializedName("name") val name: String,
    @SerializedName("description") val description: String?,
    @SerializedName("avatar_url") val avatarUrl: String?,
    @SerializedName("creator_id") val creatorId: String?,
    @SerializedName("is_private") val isPrivate: Boolean = false,
    @SerializedName("created_at") val createdAt: String?
)

data class ClubMember(
    @SerializedName("club_id") val clubId: String,
    @SerializedName("user_id") val userId: String,
    @SerializedName("role") val role: String = "member", // "creator" | "admin" | "member"
    @SerializedName("status") val status: String = "active" // "active" | "banned"
)

data class ClubMessage(
    @SerializedName("id") val id: String?,
    @SerializedName("club_id") val clubId: String,
    @SerializedName("user_id") val userId: String,
    @SerializedName("content") val content: String,
    @SerializedName("created_at") val createdAt: String?
)

data class CommunityCollection(
    @SerializedName("id") val id: String?,
    @SerializedName("name") val name: String,
    @SerializedName("description") val description: String?,
    @SerializedName("creator_id") val creatorId: String?,
    @SerializedName("is_public") val isPublic: Boolean = true,
    @SerializedName("cover_image") val coverImage: String?,
    @SerializedName("created_at") val createdAt: String?,
    @SerializedName("community_collection_items") val items: List<CommunityCollectionItem>? = null // Заполняется через join
)

data class CommunityCollectionItem(
    @SerializedName("collection_id") val collectionId: String,
    @SerializedName("anime_id") val animeId: String,
    @SerializedName("anime_title") val animeTitle: String?,
    @SerializedName("anime_image") val animeImage: String?
)

data class ForumTopic(
    @SerializedName("id") val id: String?,
    @SerializedName("author_id") val authorId: String?,
    @SerializedName("title") val title: String,
    @SerializedName("content") val content: String,
    @SerializedName("category") val category: String = "general",
    @SerializedName("anime_id") val animeId: String?,
    @SerializedName("views") val views: Int = 0,
    @SerializedName("replies_count") val repliesCount: Int = 0,
    @SerializedName("is_pinned") val isPinned: Boolean = false,
    @SerializedName("created_at") val createdAt: String?
)

// =========================================================================
// 4. ГИБКИЙ КЛАСС ЗАПРОСОВ К БАЗЕ ДАННЫХ И FLUENT BUILDER
// =========================================================================

data class DbQueryRequest(
    @SerializedName("table") val table: String,
    @SerializedName("action") val action: String, // "select" | "insert" | "update" | "delete" | "rpc"
    @SerializedName("cols") val cols: String = "*",
    @SerializedName("wheres") val wheres: List<WhereClause>? = null,
    @SerializedName("orders") val orders: List<OrderClause>? = null,
    @SerializedName("limit") val limit: Int? = null,
    @SerializedName("payload") val payload: Any? = null, // Можно передать Любой DTO (Profile, Comment и т.д.)
    @SerializedName("isSingle") val isSingle: Boolean = false
)

data class WhereClause(
    @SerializedName("col") val col: String,
    @SerializedName("op") val op: String, // "=", "LIKE", "ILIKE", "IN", "!=", "OR", ">"
    @SerializedName("val") val value: Any // Либо String, либо Int, либо List
)

data class OrderClause(
    @SerializedName("col") val col: String,
    @SerializedName("ascending") val ascending: Boolean = true
)

data class DbQueryResponse(
    @SerializedName("data") val data: Any?, // Динамически приводится к массиву или объекту на клиенте
    @SerializedName("error") val error: DbError?
)

data class DbError(
    @SerializedName("message") val message: String
)

/**
 * Fluent Query Builder для Android Kotlin. Упрощает генерацию SQL запросов к прокси.
 */
class DbQueryBuilder private constructor(private val table: String) {
    private var action: String = "select"
    private var cols: String = "*"
    private var wheres = mutableListOf<WhereClause>()
    private var orders = mutableListOf<OrderClause>()
    private var limit: Int? = null
    private var payload: Any? = null
    private var isSingle = false

    companion object {
        fun select(table: String, cols: String = "*") = DbQueryBuilder(table).apply {
            this.action = "select"
            this.cols = cols
        }

        fun insert(table: String, payload: Any) = DbQueryBuilder(table).apply {
            this.action = "insert"
            this.payload = payload
        }

        fun update(table: String, payload: Any) = DbQueryBuilder(table).apply {
            this.action = "update"
            this.payload = payload
        }

        fun delete(table: String) = DbQueryBuilder(table).apply {
            this.action = "delete"
        }

        fun rpc(table: String, parameters: Any) = DbQueryBuilder(table).apply {
            this.action = "rpc"
            this.payload = parameters
        }
    }

    fun where(col: String, op: String, value: Any) = apply {
        wheres.add(WhereClause(col, op, value))
    }

    fun orderBy(col: String, ascending: Boolean = true) = apply {
        orders.add(OrderClause(col, ascending))
    }

    fun limit(count: Int) = apply {
        this.limit = count
    }

    fun single() = apply {
        this.isSingle = true
    }

    fun build() = DbQueryRequest(
        table = table,
        action = action,
        cols = cols,
        wheres = wheres.takeIf { it.isNotEmpty() },
        orders = orders.takeIf { it.isNotEmpty() },
        limit = limit,
        payload = payload,
        isSingle = isSingle
    )
}

// Пример использования Query Builder:
// val getProfileQuery = DbQueryBuilder.select("profiles")
//     .where("id", "=", "user_uuid_123")
//     .single()
//     .build()
// apiService.executeDbQuery(getProfileQuery)

// =========================================================================
// 5. НАСТРОЙКА NETWORK-КЛИЕНТА И ПЕРЕДАЧА В EXOPLAYER (HLS PROXYING)
// =========================================================================

object KamiAnimeClient {
    private const val BASE_URL = "https://ais-pre-xrtc32traso3yympeghpvg-56932099569.us-east1.run.app/"

    val okHttpClient: OkHttpClient = OkHttpClient.Builder()
        .addInterceptor { chain ->
            val request = chain.request().newBuilder()
                .header("User-Agent", "KamiAnimeAndroid/1.0.0")
                // Обязательная инжекция Referer, чтобы проксирование сегментов и Jikan работали
                .header("Referer", "https://shikimori.one/")
                .build()
            chain.proceed(request)
        }
        .build()

    val apiService: KamiAnimeApiService = Retrofit.Builder()
        .baseUrl(BASE_URL)
        .client(okHttpClient)
        .addConverterFactory(GsonConverterFactory.create())
        .build()
        .create(KamiAnimeApiService::class.java)
}

/*
ТРЕБОВАНИЕ ДЛЯ ПЛЕЕРА CO-WATCHING И СКАЧИВАНИЯ (EXOPLAYER MEDIA3):
Когда вы создаете HlsMediaSource для проксируемого m3u8-потока:

import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.hls.HlsMediaSource

fun buildHlsSource(streamUrl: String): HlsMediaSource {
    val dataSourceFactory = DefaultHttpDataSource.Factory()
        .setAllowCrossProtocolRedirects(true)
        .setUserAgent("KamiAnimeAndroid/1.0.0")
        .setDefaultRequestProperties(mapOf("Referer" to "https://shikimori.one/"))

    val mediaItem = MediaItem.Builder()
        .setUri(streamUrl)
        .setMimeType(MimeTypes.APPLICATION_M3U8)
        .build()

    return HlsMediaSource.Factory(dataSourceFactory)
        .setAllowChunklessPreparation(false) // КРИТИЧЕСКИ ВАЖНО: ОТКЛЮЧИТЬ CHUNKLESS! Это исключает зависание проксированных сегментов ts.
        .createMediaSource(mediaItem)
}
*/

// =========================================================================
// 6. СОПОСТАВЛЕНИЕ СОБЫТИЙ СИНХРОНИЗАЦИИ CO-WATCHING ЧЕРЕЗ WEBSOCKET
// =========================================================================

sealed class WsMessage {
    @SerializedName("type") val type: String = ""

    data class InitState(
        @SerializedName("clientId") val clientId: String,
        @SerializedName("role") val role: String, // "host" | "viewer"
        @SerializedName("users") val users: List<WsUser>,
        @SerializedName("playerState") val playerState: WsPlayerState
    ) : WsMessage()

    data class UsersUpdated(
        @SerializedName("users") val users: List<WsUser>
    ) : WsMessage()

    data class RoleChange(
        @SerializedName("role") val role: String // "host" | "viewer"
    ) : WsMessage()

    data class PlayerStateBroadcast(
        @SerializedName("senderId") val senderId: String,
        @SerializedName("isPlaying") val isPlaying: Boolean,
        @SerializedName("time") val time: Double, // в секундах
        @SerializedName("episode") val episode: String
    ) : WsMessage()

    data class WebRtcSignalRelay(
        @SerializedName("senderId") val senderId: String,
        @SerializedName("signal") val signal: WebRtcSignalData
    ) : WsMessage()
}

data class WsUser(
    @SerializedName("clientId") val clientId: String,
    @SerializedName("name") val name: String,
    @SerializedName("avatar") val avatar: String?,
    @SerializedName("isMuted") val isMuted: Boolean = true,
    @SerializedName("isHost") val isHost: Boolean = false
)

data class WsPlayerState(
    @SerializedName("isPlaying") val isPlaying: Boolean,
    @SerializedName("time") val time: Double,
    @SerializedName("episode") val episode: String,
    @SerializedName("updatedAt") val updatedAt: Long
)

// Сообщение, которое шлет хост при изменении статуса его ExoPlayer
data class PlayerStateUpdate(
    @SerializedName("type") val type: String = "player-state-update",
    @SerializedName("isPlaying") val isPlaying: Boolean,
    @SerializedName("time") val time: Double, // текущее время в плеере в СЕКУНДАХ
    @SerializedName("episode") val episode: String
)

// Модели для WebRTC Mesh голосового чата (Отправка сигналов P2P)
data class WebRtcSignalRequest(
    @SerializedName("type") val type: String = "webrtc-signal",
    @SerializedName("targetId") val targetId: String, // Кому отправить сигнал в комнате
    @SerializedName("signal") val signal: WebRtcSignalData
)

data class WebRtcSignalData(
    @SerializedName("sdp") val sdp: String?, // SDP описание сессии (Offer или Answer)
    @SerializedName("candidate") val candidate: HashMap<String, Any>? // ICE-кандидат
)

/**
 * Пример обработки Web Socket комнаты на Kotlin
 */
class KamiAnimeRoomListener(
    private val onInit: (WsMessage.InitState) -> Unit,
    private val onUsersUpdated: (List<WsUser>) -> Unit,
    private val onStateSync: (WsMessage.PlayerStateBroadcast) -> Unit,
    private val onWebRtcSignal: (WsMessage.WebRtcSignalRelay) -> Unit,
    private val onRoleChange: (String) -> Unit
) : WebSocketListener() {

    private val gson = Gson()

    override fun onMessage(webSocket: WebSocket, text: String) {
        val base = gson.fromJson(text, Map::class.java)
        val type = base["type"] as? String ?: return

        when (type) {
            "init-state" -> {
                val data = gson.fromJson(text, WsMessage.InitState::class.java)
                onInit(data)
            }
            "room-users-updated" -> {
                val data = gson.fromJson(text, WsMessage.UsersUpdated::class.java)
                onUsersUpdated(data.users)
            }
            "role-change" -> {
                val data = gson.fromJson(text, WsMessage.RoleChange::class.java)
                onRoleChange(data.role)
            }
            "player-state-broadcast" -> {
                val data = gson.fromJson(text, WsMessage.PlayerStateBroadcast::class.java)
                onStateSync(data)
            }
            "webrtc-signal-relay" -> {
                val data = gson.fromJson(text, WsMessage.WebRtcSignalRelay::class.java)
                onWebRtcSignal(data)
            }
        }
    }
}
