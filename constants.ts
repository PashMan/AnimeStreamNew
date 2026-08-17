
import { Anime, Episode, ScheduleItem, User, NewsItem } from './types';

export const FALLBACK_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1920' height='800' viewBox='0 0 1920 800'%3E%3Crect width='1920' height='800' fill='%231e293b'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='48' fill='%2394a3b8'%3EИзображение недоступно%3C/text%3E%3C/svg%3E";

// Fix: Add missing email property to match the User interface requirement
export const CURRENT_USER: User = {
  name: "Hiroshi_K",
  email: "support@kamianime.club",
  avatar: "https://picsum.photos/seed/user123/200",
  isPremium: true,
  episodesWatched: 142,
  watchedTime: "48ч 12м"
};

export const COLLECTIONS_DATA = [
  { id: 'super-power', title: 'Аниме в жанре супер сила', defaultGenre: 'Супер сила', color: 'from-fuchsia-600/80 to-purple-900/90', image: 'https://picsum.photos/seed/super-power/800/600', count: '100+' },
  { id: 'friendship', title: 'Аниме про дружбу', defaultGenre: 'Повседневность', color: 'from-blue-600/80 to-indigo-900/90', image: 'https://picsum.photos/seed/friendship/800/600', count: '100+' },
  { id: 'coming-of-age', title: 'Аниме про взросление', defaultGenre: 'Драма', color: 'from-orange-600/80 to-red-900/90', image: 'https://picsum.photos/seed/coming-of-age/800/600', count: '100+' },
  { id: 'parody', title: 'Аниме пародии', defaultGenre: 'Пародия', color: 'from-pink-600/80 to-rose-900/90', image: 'https://picsum.photos/seed/parody/800/600', count: '100+' },
  { id: 'romance', title: 'Романтика', defaultGenre: 'Романтика', color: 'from-rose-500/80 to-pink-900/90', image: 'https://picsum.photos/seed/romance/800/600', count: '100+' },
  { id: 'sports', title: 'Спортивные аниме', defaultGenre: 'Спорт', color: 'from-amber-600/80 to-orange-900/90', image: 'https://picsum.photos/seed/sports/800/600', count: '100+' },
  { id: 'mecha', title: 'Меха и роботы', defaultGenre: 'Меха', color: 'from-slate-600/80 to-slate-900/90', image: 'https://picsum.photos/seed/mecha/800/600', count: '100+' },
  { id: 'music', title: 'Музыкальные', defaultGenre: 'Музыка', color: 'from-yellow-600/80 to-orange-900/90', image: 'https://picsum.photos/seed/music/800/600', count: '100+' },
  { id: 'horror', title: 'Ужасы и триллеры', defaultGenre: 'Ужасы', color: 'from-red-700/80 to-red-950/90', image: 'https://picsum.photos/seed/horror/800/600', count: '100+' },
  { id: 'martial-arts', title: 'Боевые искусства', defaultGenre: 'Боевые искусства', color: 'from-red-600/80 to-orange-900/90', image: 'https://picsum.photos/seed/martial-arts/800/600', count: '100+' },
  { id: 'vampires', title: 'Вампиры', defaultGenre: 'Вампиры', color: 'from-red-900/80 to-black/90', image: 'https://picsum.photos/seed/vampires/800/600', count: '100+' },
  { id: 'adult-cast', title: 'Взрослые персонажи', defaultGenre: 'Взрослые персонажи', color: 'from-slate-700/80 to-slate-950/90', image: 'https://picsum.photos/seed/adult-cast/800/600', count: '100+' },
  { id: 'video-games', title: 'Видеоигры', defaultGenre: 'Видеоигры', color: 'from-blue-500/80 to-indigo-800/90', image: 'https://picsum.photos/seed/video-games/800/600', count: '100+' },
  { id: 'military', title: 'Военное', defaultGenre: 'Военное', color: 'from-olive-600/80 to-slate-900/90', image: 'https://picsum.photos/seed/military/800/600', count: '100+' },
  { id: 'survival', title: 'Выживание', defaultGenre: 'Выживание', color: 'from-stone-600/80 to-stone-900/90', image: 'https://picsum.photos/seed/survival/800/600', count: '100+' },
  { id: 'harem', title: 'Гарем', defaultGenre: 'Гарем', color: 'from-pink-500/80 to-rose-800/90', image: 'https://picsum.photos/seed/harem/800/600', count: '100+' },
  { id: 'racing', title: 'Гонки', defaultGenre: 'Гонки', color: 'from-yellow-500/80 to-red-600/90', image: 'https://picsum.photos/seed/racing/800/600', count: '100+' },
  { id: 'gag-humor', title: 'Гэг-юмор', defaultGenre: 'Гэг-юмор', color: 'from-lime-500/80 to-green-700/90', image: 'https://picsum.photos/seed/gag-humor/800/600', count: '100+' },
  { id: 'detective', title: 'Детектив', defaultGenre: 'Детектив', color: 'from-blue-800/80 to-slate-950/90', image: 'https://picsum.photos/seed/detective/800/600', count: '100+' },
  { id: 'gore', title: 'Жестокость', defaultGenre: 'Жестокость', color: 'from-red-800/80 to-black/90', image: 'https://picsum.photos/seed/gore/800/600', count: '100+' },
  { id: 'childcare', title: 'Забота о детях', defaultGenre: 'Забота о детях', color: 'from-sky-400/80 to-blue-600/90', image: 'https://picsum.photos/seed/childcare/800/600', count: '100+' },
  { id: 'high-stakes-game', title: 'Игра с высокими ставками', defaultGenre: 'Игра с высокими ставками', color: 'from-violet-800/80 to-purple-950/90', image: 'https://picsum.photos/seed/high-stakes-game/800/600', count: '100+' },
  { id: 'idols-female', title: 'Идолы (Жен.)', defaultGenre: 'Идолы (Жен.)', color: 'from-pink-400/80 to-fuchsia-600/90', image: 'https://picsum.photos/seed/idols-female/800/600', count: '100+' },
  { id: 'idols-male', title: 'Идолы (Муж.)', defaultGenre: 'Идолы (Муж.)', color: 'from-blue-400/80 to-indigo-600/90', image: 'https://picsum.photos/seed/idols-male/800/600', count: '100+' },
  { id: 'visual-arts', title: 'Изобразительное искусство', defaultGenre: 'Изобразительное искусство', color: 'from-teal-500/80 to-emerald-800/90', image: 'https://picsum.photos/seed/visual-arts/800/600', count: '100+' },
  { id: 'performing-arts', title: 'Исполнительское искусство', defaultGenre: 'Исполнительское искусство', color: 'from-purple-500/80 to-violet-800/90', image: 'https://picsum.photos/seed/performing-arts/800/600', count: '100+' },
  { id: 'historical', title: 'Исторический', defaultGenre: 'Исторический', color: 'from-amber-800/80 to-orange-950/90', image: 'https://picsum.photos/seed/historical/800/600', count: '100+' },
  { id: 'iyashikei', title: 'Иясикэй (Исцеление)', defaultGenre: 'Иясикэй', color: 'from-green-300/80 to-teal-500/90', image: 'https://picsum.photos/seed/iyashikei/800/600', count: '100+' },
  { id: 'team-sports', title: 'Командный спорт', defaultGenre: 'Командный спорт', color: 'from-orange-500/80 to-red-700/90', image: 'https://picsum.photos/seed/team-sports/800/600', count: '100+' },
  { id: 'space', title: 'Космос', defaultGenre: 'Космос', color: 'from-indigo-900/80 to-black/90', image: 'https://picsum.photos/seed/space/800/600', count: '100+' },
  { id: 'crossdressing', title: 'Кроссдрессинг', defaultGenre: 'Кроссдрессинг', color: 'from-violet-400/80 to-purple-600/90', image: 'https://picsum.photos/seed/crossdressing/800/600', count: '100+' },
  { id: 'otaku-culture', title: 'Культура отаку', defaultGenre: 'Культура отаку', color: 'from-blue-600/80 to-indigo-900/90', image: 'https://picsum.photos/seed/otaku-culture/800/600', count: '100+' },
  { id: 'love-polygon', title: 'Любовный многоугольник', defaultGenre: 'Любовный многоугольник', color: 'from-rose-400/80 to-pink-700/90', image: 'https://picsum.photos/seed/love-polygon/800/600', count: '100+' },
  { id: 'magical-sex-shift', title: 'Магическая смена пола', defaultGenre: 'Магическая смена пола', color: 'from-cyan-400/80 to-blue-600/90', image: 'https://picsum.photos/seed/magical-sex-shift/800/600', count: '100+' },
  { id: 'mahou-shoujo', title: 'Махо-сёдзё', defaultGenre: 'Махо-сёдзё', color: 'from-pink-300/80 to-rose-500/90', image: 'https://picsum.photos/seed/mahou-shoujo/800/600', count: '100+' },
  { id: 'medicine', title: 'Медицина', defaultGenre: 'Медицина', color: 'from-sky-500/80 to-blue-700/90', image: 'https://picsum.photos/seed/medicine/800/600', count: '100+' },
  { id: 'mythology', title: 'Мифология', defaultGenre: 'Мифология', color: 'from-amber-700/80 to-orange-900/90', image: 'https://picsum.photos/seed/mythology/800/600', count: '100+' },
  { id: 'educational', title: 'Образовательное', defaultGenre: 'Образовательное', color: 'from-emerald-600/80 to-green-900/90', image: 'https://picsum.photos/seed/educational/800/600', count: '100+' },
  { id: 'organized-crime', title: 'Организованная преступность', defaultGenre: 'Организованная преступность', color: 'from-slate-800/80 to-black/90', image: 'https://picsum.photos/seed/organized-crime/800/600', count: '100+' },
  { id: 'pets', title: 'Питомцы', defaultGenre: 'Питомцы', color: 'from-orange-300/80 to-amber-500/90', image: 'https://picsum.photos/seed/pets/800/600', count: '100+' },
  { id: 'psychological', title: 'Психологическое', defaultGenre: 'Психологическое', color: 'from-violet-900/80 to-black/90', image: 'https://picsum.photos/seed/psychological/800/600', count: '100+' },
  { id: 'time-travel', title: 'Путешествие во времени', defaultGenre: 'Путешествие во времени', color: 'from-blue-700/80 to-indigo-950/90', image: 'https://picsum.photos/seed/time-travel/800/600', count: '100+' },
  { id: 'workplace', title: 'Работа', defaultGenre: 'Работа', color: 'from-slate-600/80 to-slate-800/90', image: 'https://picsum.photos/seed/workplace/800/600', count: '100+' },
  { id: 'reverse-harem', title: 'Реверс-гарем', defaultGenre: 'Реверс-гарем', color: 'from-rose-600/80 to-purple-800/90', image: 'https://picsum.photos/seed/reverse-harem/800/600', count: '100+' },
  { id: 'reincarnation', title: 'Реинкарнация', defaultGenre: 'Реинкарнация', color: 'from-emerald-500/80 to-teal-800/90', image: 'https://picsum.photos/seed/reincarnation/800/600', count: '100+' },
  { id: 'romantic-subtext', title: 'Романтический подтекст', defaultGenre: 'Романтический подтекст', color: 'from-pink-300/80 to-rose-400/90', image: 'https://picsum.photos/seed/romantic-subtext/800/600', count: '100+' },
  { id: 'samurai', title: 'Самураи', defaultGenre: 'Самураи', color: 'from-red-800/80 to-orange-950/90', image: 'https://picsum.photos/seed/samurai/800/600', count: '100+' },
  { id: 'combat-sports', title: 'Спортивные единоборства', defaultGenre: 'Спортивные единоборства', color: 'from-red-700/80 to-orange-800/90', image: 'https://picsum.photos/seed/combat-sports/800/600', count: '100+' },
  { id: 'strategy-game', title: 'Стратегические игры', defaultGenre: 'Стратегические игры', color: 'from-blue-900/80 to-slate-900/90', image: 'https://picsum.photos/seed/strategy-game/800/600', count: '100+' },
  { id: 'award-winning', title: 'Удостоено наград', defaultGenre: 'Удостоено наград', color: 'from-yellow-600/80 to-amber-800/90', image: 'https://picsum.photos/seed/award-winning/800/600', count: '100+' },
  { id: 'delinquents', title: 'Хулиганы', defaultGenre: 'Хулиганы', color: 'from-slate-700/80 to-zinc-900/90', image: 'https://picsum.photos/seed/delinquents/800/600', count: '100+' },
  { id: 'school', title: 'Школа', defaultGenre: 'Школа', color: 'from-blue-400/80 to-indigo-600/90', image: 'https://picsum.photos/seed/school/800/600', count: '100+' },
  { id: 'show-biz', title: 'Шоу-бизнес', defaultGenre: 'Шоу-бизнес', color: 'from-fuchsia-500/80 to-purple-800/90', image: 'https://picsum.photos/seed/show-biz/800/600', count: '100+' },
];

export const MOCK_ANIME: Anime[] = [
  {
    id: "1",
    title: "Поднятие уровня в одиночку",
    originalName: "Solo Leveling",
    image: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%231e293b'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='24' fill='%2394a3b8'%3EAnime 1%3C/text%3E%3C/svg%3E",
    cover: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1920' height='800' viewBox='0 0 1920 800'%3E%3Crect width='1920' height='800' fill='%231e293b'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='48' fill='%2394a3b8'%3EAnime 1 Cover%3C/text%3E%3C/svg%3E",
    rating: 9.8,
    year: 2024,
    type: "TV Series",
    genres: ["Экшен", "Фэнтези"],
    episodes: 12,
    status: "Ongoing",
    studio: "A-1 Pictures",
    description: "Десять лет назад появились «Врата», соединившие мир людей с измерением монстров. Обычные люди получили сверхспособности и стали «Охотниками». Сон Джин-Ву — слабейший охотник E-ранга, который пытается выжить в этом новом жестоком мире."
  },
  {
    id: "2",
    title: "Провожающая в последний путь Фрирен",
    originalName: "Sousou no Frieren",
    image: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%231e293b'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='24' fill='%2394a3b8'%3EAnime 2%3C/text%3E%3C/svg%3E",
    cover: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1920' height='800' viewBox='0 0 1920 800'%3E%3Crect width='1920' height='800' fill='%231e293b'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='48' fill='%2394a3b8'%3EAnime 2 Cover%3C/text%3E%3C/svg%3E",
    rating: 9.6,
    year: 2023,
    type: "TV Series",
    genres: ["Приключения", "Фэнтези", "Драма"],
    episodes: 28,
    status: "Ongoing",
    studio: "Madhouse",
    description: "Король демонов повержен, и отряд героев возвращается домой. Эльфийка-маг Фрирен, герой Химмель, священник Хайтер и воин Айзен вспоминают свое десятилетнее путешествие. Но для эльфа время течет иначе..."
  },
  {
    id: "3",
    title: "Магическая битва",
    originalName: "Jujutsu Kaisen",
    image: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%231e293b'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='24' fill='%2394a3b8'%3EAnime 3%3C/text%3E%3C/svg%3E",
    cover: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1920' height='800' viewBox='0 0 1920 800'%3E%3Crect width='1920' height='800' fill='%231e293b'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='48' fill='%2394a3b8'%3EAnime 3 Cover%3C/text%3E%3C/svg%3E",
    rating: 9.5,
    year: 2023,
    type: "TV Series",
    genres: ["Экшен", "Мистика"],
    episodes: 24,
    status: "Completed",
    studio: "MAPPA",
    description: "Юдзи Итадори — старшеклассник с выдающимися физическими данными, который вступает в клуб оккультизма. Вскоре он сталкивается с реальными проклятиями и становится сосудом для могущественного духа Сукуны."
  },
  {
    id: "4",
    title: "Человек-бензопила",
    originalName: "Chainsaw Man",
    image: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%231e293b'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='24' fill='%2394a3b8'%3EAnime 4%3C/text%3E%3C/svg%3E",
    cover: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1920' height='800' viewBox='0 0 1920 800'%3E%3Crect width='1920' height='800' fill='%231e293b'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='48' fill='%2394a3b8'%3EAnime 4 Cover%3C/text%3E%3C/svg%3E",
    rating: 8.9,
    year: 2022,
    type: "TV Series",
    genres: ["Экшен", "Ужасы"],
    episodes: 12,
    status: "Completed",
    studio: "MAPPA",
    description: "Дэнджи мечтает о простой жизни: вкусной еде и девушке рядом. Но долги отца заставляют его работать охотником на демонов вместе со своим питомцем-демоном Почитой. Предательство меняет всё..."
  },
  {
    id: "5",
    title: "Атака титанов: Финал",
    originalName: "Shingeki no Kyojin: The Final Season",
    image: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%231e293b'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='24' fill='%2394a3b8'%3EAnime 5%3C/text%3E%3C/svg%3E",
    cover: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1920' height='800' viewBox='0 0 1920 800'%3E%3Crect width='1920' height='800' fill='%231e293b'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='48' fill='%2394a3b8'%3EAnime 5 Cover%3C/text%3E%3C/svg%3E",
    rating: 9.9,
    year: 2023,
    type: "TV Series",
    genres: ["Экшен", "Драма", "Военное"],
    episodes: 30,
    status: "Completed",
    studio: "MAPPA",
    description: "Война за Парадиз достигает кульминации. Эрен Йегер запускает Гул Земли, чтобы уничтожить врагов острова, в то время как его бывшие товарищи пытаются остановить апокалипсис."
  },
  {
    id: "6",
    title: "Семья шпиона",
    originalName: "Spy x Family",
    image: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='300' height='450' fill='%231e293b'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='24' fill='%2394a3b8'%3EAnime 6%3C/text%3E%3C/svg%3E",
    cover: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1920' height='800' viewBox='0 0 1920 800'%3E%3Crect width='1920' height='800' fill='%231e293b'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='48' fill='%2394a3b8'%3EAnime 6 Cover%3C/text%3E%3C/svg%3E",
    rating: 8.8,
    year: 2022,
    type: "TV Series",
    genres: ["Комедия", "Экшен"],
    episodes: 25,
    status: "Completed",
    studio: "Wit Studio",
    description: "Шпион под кодовым именем «Сумрак» должен создать фиктивную семью для выполнения миссии. Он не знает, что его жена — наемная убийца, а приемная дочь — телепат."
  }
];

export const MOCK_EPISODES: Episode[] = Array.from({ length: 12 }, (_, i) => ({
  id: `ep-${i + 1}`,
  number: i + 1,
  title: `Эпизод ${i + 1}: Начало конца`,
  duration: "24:00",
  thumbnail: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='170' viewBox='0 0 300 170'%3E%3Crect width='300' height='170' fill='%231e293b'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='16' fill='%2394a3b8'%3EEpisode ${i + 1}%3C/text%3E%3C/svg%3E`,
  isFiller: i === 7 // Arbitrary filler
}));

export const SCHEDULE: ScheduleItem[] = [
  { day: "Пн", animes: [{ id: "1", time: "20:30", title: "Поднятие уровня", slug: "solo-leveling" }, { id: "2", time: "22:00", title: "Волейбол!!", slug: "haikyuu" }] },
  { day: "Вт", animes: [{ id: "4", time: "18:00", title: "Человек-бензопила", slug: "chainsaw-man" }] },
  { day: "Ср", animes: [{ id: "3", time: "19:30", title: "Магическая битва", slug: "jujutsu-kaisen" }, { id: "6", time: "21:00", title: "Семья шпиона", slug: "spy-x-family" }] },
  { day: "Чт", animes: [{ id: "2", time: "20:00", title: "Фрирен", slug: "frieren" }] },
  { day: "Пт", animes: [{ id: "5", time: "23:00", title: "Атака титанов", slug: "attack-on-titan" }] },
  { day: "Сб", animes: [{ id: "1", time: "10:00", title: "Ван-Пис", slug: "one-piece" }] },
  { day: "Вс", animes: [{ id: "6", time: "12:00", title: "Истребитель демонов", slug: "demon-slayer" }] },
];

export const MOCK_NEWS: NewsItem[] = [
  {
    id: "n1",
    title: "Анонсирован 3 сезон «Магической битвы»",
    summary: "Студия MAPPA официально подтвердила работу над продолжением. Арка «Culling Game» будет экранизирована.",
    date: "12 Окт 2024",
    category: "Анонсы"
  },
  {
    id: "n2",
    title: "Фильм «Человек-бензопила» выйдет в 2025 году",
    summary: "Полнометражная арка про Резе выйдет на большие экраны. Тизер-трейлер уже доступен.",
    date: "10 Окт 2024",
    category: "Фильмы"
  },
  {
    id: "n3",
    title: "Топ-10 лучших опенингов сезона",
    summary: "Мы собрали подборку самых запоминающихся музыкальных тем этой осени.",
    date: "08 Окт 2024",
    category: "Подборки"
  },
  {
    id: "n4",
    title: "Интервью с создателем «One Piece»",
    summary: "Эйитиро Ода рассказал о финальной саге и о том, что ждет Луффи в конце пути.",
    date: "05 Окт 2024",
    category: "Интервью"
  }
];