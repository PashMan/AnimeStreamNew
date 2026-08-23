// Complete registry of officially licensed Manga & Manhwa in Russia & CIS
// Publishers: Азбука, XL Media, Истари Комикс, АСТ Mainstream, Alt Graph, Фабрика Комиксов, Эксмо, Freedom, Комильфо, Bubble и др.

export interface LicensedMangaItem {
  id: string;
  titleRu: string;
  titleEn: string;
  titleJp?: string;
  aliases: string[];
  publisher: string;
  type: 'manga' | 'manhwa' | 'manhua' | 'ranobe';
  year?: number;
  note?: string;
}

export const LICENSED_MANGA_LIST: LicensedMangaItem[] = [
  // --- АЗБУКА-АТТИКУС ---
  {
    id: "attack-on-titan",
    titleRu: "Атака на титанов",
    titleEn: "Attack on Titan",
    titleJp: "Shingeki no Kyojin",
    aliases: ["Атака титанов", "Вторжение гигантов", "Вторжение титанов", "Shingeki no Kyojin", "Attack on Titan", "AOT", "Shingeki"],
    publisher: "Азбука",
    type: "manga"
  },
  {
    id: "chainsaw-man",
    titleRu: "Человек-бензопила",
    titleEn: "Chainsaw Man",
    titleJp: "Chainsawman",
    aliases: ["Человек бензопила", "Бензопила", "Chainsaw Man", "Chainsawman", "Chainsaw-man", "CSM"],
    publisher: "Азбука",
    type: "manga"
  },
  {
    id: "jujutsu-kaisen",
    titleRu: "Магическая битва",
    titleEn: "Jujutsu Kaisen",
    titleJp: "Jujutsu Kaisen",
    aliases: ["Магическая битва", "Jujutsu Kaisen", "JJK", "Волшебный бой", "Jujutsu Kaisen 0"],
    publisher: "Азбука",
    type: "manga"
  },
  {
    id: "one-piece",
    titleRu: "One Piece. Большой куш",
    titleEn: "One Piece",
    titleJp: "Wan Pīsu",
    aliases: ["Ван Пис", "Ван-Пис", "Большой куш", "One Piece", "OnePiece", "One-Piece"],
    publisher: "Азбука",
    type: "manga"
  },
  {
    id: "naruto",
    titleRu: "Наруто",
    titleEn: "Naruto",
    titleJp: "Naruto",
    aliases: ["Наруто", "Naruto", "Наруто: Ураганные хроники", "Naruto Shippuden", "Боруто", "Boruto"],
    publisher: "Азбука",
    type: "manga"
  },
  {
    id: "death-note",
    titleRu: "Тетрадь смерти",
    titleEn: "Death Note",
    titleJp: "Desu Nōto",
    aliases: ["Тетрадь смерти", "Death Note", "Deathnote", "Тетрадка смерти"],
    publisher: "Азбука",
    type: "manga"
  },
  {
    id: "tokyo-ghoul",
    titleRu: "Токийский гуль",
    titleEn: "Tokyo Ghoul",
    titleJp: "Toukyou Kushu",
    aliases: ["Токийский гуль", "Токийский монстр", "Tokyo Ghoul", "Tokyo Ghoul:re", "Tokyo Ghoul re", "Токийский гуль:re"],
    publisher: "Азбука",
    type: "manga"
  },
  {
    id: "fullmetal-alchemist",
    titleRu: "Стальной алхимик",
    titleEn: "Fullmetal Alchemist",
    titleJp: "Hagane no Renkinjutsushi",
    aliases: ["Стальной алхимик", "Цельнометаллический алхимик", "Fullmetal Alchemist", "FMA", "Hagane no Renkinjutsushi"],
    publisher: "Азбука",
    type: "manga"
  },
  {
    id: "my-hero-academia",
    titleRu: "Моя геройская академия",
    titleEn: "My Hero Academia",
    titleJp: "Boku no Hero Academia",
    aliases: ["Моя геройская академия", "Геройская академия", "Boku no Hero Academia", "My Hero Academia", "BNHA", "MHA"],
    publisher: "Азбука",
    type: "manga"
  },
  {
    id: "one-punch-man",
    titleRu: "One-Punch Man",
    titleEn: "One-Punch Man",
    titleJp: "Wanpanman",
    aliases: ["Ванпанчмен", "Ванпанчмэн", "Ван панч мен", "Человек одного удара", "One-Punch Man", "One Punch Man", "OPM"],
    publisher: "Азбука",
    type: "manga"
  },
  {
    id: "bakuman",
    titleRu: "Бакуман",
    titleEn: "Bakuman",
    titleJp: "Bakuman.",
    aliases: ["Бакуман", "Bakuman", "Bakuman."],
    publisher: "Азбука",
    type: "manga"
  },
  {
    id: "blue-lock",
    titleRu: "Синяя тюрьма: Блю Лок",
    titleEn: "Blue Lock",
    titleJp: "Burū Rokku",
    aliases: ["Синяя тюрьма: Блю Лок", "Синяя тюрьма", "Блю Лок", "Блу Лок", "Blue Lock"],
    publisher: "Азбука",
    type: "manga"
  },
  {
    id: "kaguya-sama",
    titleRu: "Госпожа Кагуя: В любви как на войне",
    titleEn: "Kaguya-sama: Love Is War",
    titleJp: "Kaguya-sama wa Kokurasetai",
    aliases: ["Госпожа Кагуя: В любви как на войне", "Госпожа Кагуя", "Кагуя хочет признаться", "Kaguya-sama", "Kaguya-sama wa Kokurasetai", "Love Is War"],
    publisher: "Азбука",
    type: "manga"
  },
  {
    id: "shaman-king",
    titleRu: "Король шаманов",
    titleEn: "Shaman King",
    titleJp: "Shāman Kingu",
    aliases: ["Король шаманов", "Шаман Кинг", "Shaman King"],
    publisher: "Азбука",
    type: "manga"
  },
  {
    id: "soul-eater",
    titleRu: "Пожиратель душ",
    titleEn: "Soul Eater",
    titleJp: "Sōru Ītā",
    aliases: ["Пожиратель душ", "Соул Итер", "Soul Eater", "Soul Eater Not!"],
    publisher: "Азбука",
    type: "manga"
  },
  {
    id: "ghost-in-the-shell",
    titleRu: "Призрак в доспехах",
    titleEn: "Ghost in the Shell",
    titleJp: "Koukaku Kidoutai",
    aliases: ["Призрак в доспехах", "Ghost in the Shell", "Koukaku Kidoutai"],
    publisher: "Азбука",
    type: "manga"
  },
  {
    id: "dragon-ball",
    titleRu: "Dragon Ball. Драконий жемчуг",
    titleEn: "Dragon Ball",
    titleJp: "Doragon Bōru",
    aliases: ["Драконий жемчуг", "Dragon Ball", "Dragonball", "Dragon Ball Super", "Драгонболл"],
    publisher: "Азбука",
    type: "manga"
  },
  {
    id: "chobits",
    titleRu: "Чобиты",
    titleEn: "Chobits",
    titleJp: "Chobittsu",
    aliases: ["Чобиты", "Chobits", "Chobits!"],
    publisher: "Азбука",
    type: "manga"
  },
  {
    id: "all-you-need-is-kill",
    titleRu: "All You Need Is Kill. Грань будущего",
    titleEn: "All You Need Is Kill",
    titleJp: "Ōru Yū Nīdo Izu Kiru",
    aliases: ["All You Need Is Kill", "Грань будущего"],
    publisher: "Азбука",
    type: "manga"
  },

  // --- XL MEDIA ---
  {
    id: "berserk",
    titleRu: "Берсерк",
    titleEn: "Berserk",
    titleJp: "Beruseruku",
    aliases: ["Берсерк", "Berserk"],
    publisher: "XL Media",
    type: "manga"
  },
  {
    id: "tokyo-revengers",
    titleRu: "Токийские мстители",
    titleEn: "Tokyo Revengers",
    titleJp: "Toukyou Ribenjāzu",
    aliases: ["Токийские мстители", "Токио Ривенджерс", "Tokyo Revengers"],
    publisher: "XL Media",
    type: "manga"
  },
  {
    id: "sailor-moon",
    titleRu: "Прекрасная воительница Сейлор Мун",
    titleEn: "Pretty Guardian Sailor Moon",
    titleJp: "Bishoujo Senshi Sailor Moon",
    aliases: ["Сейлор Мун", "Сейлормун", "Sailor Moon", "Bishoujo Senshi Sailor Moon", "Красавица-воин Сейлор Мун"],
    publisher: "XL Media",
    type: "manga"
  },
  {
    id: "fairy-tail",
    titleRu: "Fairy Tail. Хвост Феи",
    titleEn: "Fairy Tail",
    titleJp: "Fearī Teiru",
    aliases: ["Хвост Феи", "Фейри Тейл", "Фэйри Тэйл", "Fairy Tail", "Сказка о Хвосте Феи"],
    publisher: "XL Media",
    type: "manga"
  },
  {
    id: "seven-deadly-sins",
    titleRu: "Семь смертных грехов",
    titleEn: "The Seven Deadly Sins",
    titleJp: "Nanatsu no Taizai",
    aliases: ["Семь смертных грехов", "Nanatsu no Taizai", "The Seven Deadly Sins", "7 смертных грехов"],
    publisher: "XL Media",
    type: "manga"
  },
  {
    id: "gantz",
    titleRu: "Ганц",
    titleEn: "Gantz",
    titleJp: "Gantsu",
    aliases: ["Ганц", "Гантз", "Gantz", "Gantz:G", "Gantz:E"],
    publisher: "XL Media",
    type: "manga"
  },
  {
    id: "made-in-abyss",
    titleRu: "Созданный в Бездне",
    titleEn: "Made in Abyss",
    titleJp: "Meido in Abisu",
    aliases: ["Созданный в Бездне", "Созданный в бездне", "Made in Abyss", "Сделано в бездне"],
    publisher: "XL Media",
    type: "manga"
  },
  {
    id: "noragami",
    titleRu: "Бездомный бог",
    titleEn: "Noragami: Stray God",
    titleJp: "Noragami",
    aliases: ["Бездомный бог", "Норагами", "Noragami", "Noragami: Stray God"],
    publisher: "XL Media",
    type: "manga"
  },
  {
    id: "shield-hero",
    titleRu: "Восхождение Героя Щита",
    titleEn: "The Rising of the Shield Hero",
    titleJp: "Tate no Yuusha no Nariagari",
    aliases: ["Восхождение героя щита", "Герой щита", "Tate no Yuusha no Nariagari", "The Rising of the Shield Hero", "Восхождение щитовика"],
    publisher: "XL Media",
    type: "manga"
  },
  {
    id: "kamisama-kiss",
    titleRu: "Очень приятно, Бог",
    titleEn: "Kamisama Kiss",
    titleJp: "Kamisama Hajimemashita",
    aliases: ["Очень приятно, Бог", "Очень приятно Бог", "Kamisama Hajimemashita", "Kamisama Kiss", "Приятно познакомиться, Бог"],
    publisher: "XL Media",
    type: "manga"
  },
  {
    id: "bakemonogatari",
    titleRu: "Истории монстров",
    titleEn: "Bakemonogatari",
    titleJp: "Bakemonogatari",
    aliases: ["Истории монстров", "Истории ран", "Бакемоногатари", "Bakemonogatari", "Kizumonogatari", "Monogatari Series"],
    publisher: "XL Media",
    type: "manga"
  },
  {
    id: "gunnm",
    titleRu: "Battle Angel Alita. Боевой ангел Алита",
    titleEn: "Battle Angel Alita",
    titleJp: "Gunnm",
    aliases: ["Боевой ангел Алита", "Алита", "Ганнм", "Gunnm", "Battle Angel Alita", "Сны оружия"],
    publisher: "XL Media",
    type: "manga"
  },
  {
    id: "blame",
    titleRu: "Блейм!",
    titleEn: "Blame!",
    titleJp: "Buramu!",
    aliases: ["Блейм", "Блейм!", "Blame!", "Blame"],
    publisher: "XL Media",
    type: "manga"
  },
  {
    id: "knights-of-sidonia",
    titleRu: "Рыцари Сидонии",
    titleEn: "Knights of Sidonia",
    titleJp: "Sidonia no Kishi",
    aliases: ["Рыцари Сидонии", "Рыцари «Сидонии»", "Sidonia no Kishi", "Knights of Sidonia"],
    publisher: "XL Media",
    type: "manga"
  },
  {
    id: "my-little-monster",
    titleRu: "Чудовище за соседней партой",
    titleEn: "My Little Monster",
    titleJp: "Tonari no Kaibutsu-kun",
    aliases: ["Чудовище за соседней партой", "Монстр за соседней партой", "Tonari no Kaibutsu-kun", "My Little Monster"],
    publisher: "XL Media",
    type: "manga"
  },
  {
    id: "steins-gate",
    titleRu: "Врата Штейна",
    titleEn: "Steins;Gate",
    titleJp: "Shutainzu Gēto",
    aliases: ["Врата Штейна", "Врата Штейнера", "Steins;Gate", "Steins Gate", "SteinsGate"],
    publisher: "XL Media",
    type: "manga"
  },
  {
    id: "land-of-the-lustrous",
    titleRu: "Страна самоцветов",
    titleEn: "Land of the Lustrous",
    titleJp: "Houseki no Kuni",
    aliases: ["Страна самоцветов", "Houseki no Kuni", "Land of the Lustrous", "Королевство самоцветов"],
    publisher: "XL Media",
    type: "manga"
  },
  {
    id: "akira",
    titleRu: "Акира",
    titleEn: "Akira",
    titleJp: "Akira",
    aliases: ["Акира", "Akira"],
    publisher: "XL Media",
    type: "manga"
  },
  {
    id: "kill-la-kill",
    titleRu: "Убей или умри",
    titleEn: "Kill la Kill",
    titleJp: "Kiru ra Kiru",
    aliases: ["Убей или умри", "Круши кромсай", "Kill la Kill", "Kill La Kill"],
    publisher: "XL Media",
    type: "manga"
  },

  // --- ИСТАРИ КОМИКС ---
  {
    id: "demon-slayer",
    titleRu: "Истребитель демонов: Kimetsu no Yaiba",
    titleEn: "Demon Slayer: Kimetsu no Yaiba",
    titleJp: "Kimetsu no Yaiba",
    aliases: ["Истребитель демонов", "Клинок рассекающий демонов", "Клинок, рассекающий демонов", "Kimetsu no Yaiba", "Demon Slayer", "KNY", "Клинок Демонов"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "vinland-saga",
    titleRu: "Сага о Винланде",
    titleEn: "Vinland Saga",
    titleJp: "Vinrando Saga",
    aliases: ["Сага о Винланде", "Сага о винланде", "Vinland Saga", "Винланд"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "promised-neverland",
    titleRu: "Обещанная Страна Грёз",
    titleEn: "The Promised Neverland",
    titleJp: "Yakusoku no Nebārando",
    aliases: ["Обещанный Неверленд", "Обещанная Страна Грёз", "Обещанная страна грез", "Yakusoku no Neverland", "The Promised Neverland", "TPN"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "spy-x-family",
    titleRu: "Семья шпиона",
    titleEn: "Spy x Family",
    titleJp: "Supai Famirī",
    aliases: ["Семья шпиона", "Шпионская семья", "Spy x Family", "SpyxFamily", "Spy Family", "Семья шпионов"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "evangelion",
    titleRu: "Евангелион",
    titleEn: "Neon Genesis Evangelion",
    titleJp: "Shinseiki Evangerion",
    aliases: ["Евангелион", "Неон Генезис Евангелион", "Neon Genesis Evangelion", "Shinseiki Evangelion", "NGE", "Ева"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "a-silent-voice",
    titleRu: "Форма голоса",
    titleEn: "A Silent Voice",
    titleJp: "Koe no Katachi",
    aliases: ["Форма голоса", "Koe no Katachi", "A Silent Voice", "Безмолвный голос"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "your-name",
    titleRu: "Твоё имя",
    titleEn: "Your Name",
    titleJp: "Kimi no Na wa.",
    aliases: ["Твоё имя", "Твое имя", "Kimi no Na wa", "Kimi no Na wa.", "Your Name"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "weathering-with-you",
    titleRu: "Дитя погоды",
    titleEn: "Weathering with You",
    titleJp: "Tenki no Ko",
    aliases: ["Дитя погоды", "Tenki no Ko", "Weathering with You", "Weathering With You"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "5-centimeters-per-second",
    titleRu: "Пять сантиметров в секунду",
    titleEn: "5 Centimeters per Second",
    titleJp: "Byousoku 5 Centimeter",
    aliases: ["5 сантиметров в секунду", "Пять сантиметров в секунду", "Byousoku 5 Centimeter", "5 Centimeters per Second"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "garden-of-words",
    titleRu: "Сад изящных слов",
    titleEn: "The Garden of Words",
    titleJp: "Kotonoha no Niwa",
    aliases: ["Сад изящных слов", "Kotonoha no Niwa", "The Garden of Words"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "voices-of-a-distant-star",
    titleRu: "Голос далёкой звезды",
    titleEn: "Voices of a Distant Star",
    titleJp: "Hoshi no Koe",
    aliases: ["Голос далёкой звезды", "Голос далекой звезды", "Hoshi no Koe", "Voices of a Distant Star"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "suzume",
    titleRu: "Судзумэ, закрывающая двери",
    titleEn: "Suzume",
    titleJp: "Suzume no Tojimari",
    aliases: ["Судзумэ, закрывающая двери", "Судзумэ", "Suzume no Tojimari", "Suzume"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "your-lie-in-april",
    titleRu: "Твоя апрельская ложь",
    titleEn: "Your Lie in April",
    titleJp: "Shigatsu wa Kimi no Uso",
    aliases: ["Твое апрельское вранье", "Твоя апрельская ложь", "Shigatsu wa Kimi no Uso", "Your Lie in April"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "rent-a-girlfriend",
    titleRu: "Девушка напрокат",
    titleEn: "Rent-A-Girlfriend",
    titleJp: "Kanojo, Okarishimasu",
    aliases: ["Девушка на час", "Девушка напрокат", "Kanojo Okarishimasu", "Kanojo, Okarishimasu", "Rent-A-Girlfriend", "Rent a Girlfriend", "Канокари"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "quintessential-quintuplets",
    titleRu: "Пять невест",
    titleEn: "The Quintessential Quintuplets",
    titleJp: "5-toubun no Hanayome",
    aliases: ["Пять невест", "Пять равных невест", "5-toubun no Hanayome", "Gotoubun no Hanayome", "The Quintessential Quintuplets", "5 невест"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "pandora-hearts",
    titleRu: "Сердца Пандоры",
    titleEn: "Pandora Hearts",
    titleJp: "Pandora Hātsu",
    aliases: ["Сердца Пандоры", "Сердца пандоры", "Pandora Hearts"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "case-study-of-vanitas",
    titleRu: "Мемуары Ванитаса",
    titleEn: "The Case Study of Vanitas",
    titleJp: "Vanitas no Carte",
    aliases: ["Мемуары Ванитаса", "Записки Ванитаса", "Vanitas no Carte", "The Case Study of Vanitas"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "akame-ga-kill",
    titleRu: "Убийца Акаме!",
    titleEn: "Akame ga Kill!",
    titleJp: "Akame ga Kiru!",
    aliases: ["Убийца Акаме", "Убийца Акаме!", "Akame ga Kill!", "Akame ga Kill", "Akame ga Kill! ZERO"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "goblin-slayer",
    titleRu: "Убийца Гоблинов",
    titleEn: "Goblin Slayer",
    titleJp: "Goburin Sureiyā",
    aliases: ["Убийца гоблинов", "Убийца Гоблинов", "Goblin Slayer"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "ancient-magus-bride",
    titleRu: "Невеста чародея",
    titleEn: "The Ancient Magus' Bride",
    titleJp: "Mahoutsukai no Yome",
    aliases: ["Невеста чародея", "Невеста мага", "Mahoutsukai no Yome", "The Ancient Magus' Bride", "Ancient Magus Bride"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "haikyuu",
    titleRu: "Haikyu!! Волейбол!!",
    titleEn: "Haikyu!!",
    titleJp: "Haikyū!!",
    aliases: ["Волейбол!!", "Волейбол!", "Волейбол", "Haikyu!!", "Haikyuu!!", "Haikyuu", "Haikyu"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "kuroko-no-basket",
    titleRu: "Баскетбол Куроко",
    titleEn: "Kuroko's Basketball",
    titleJp: "Kuroko no Basuke",
    aliases: ["Баскетбол Куроко", "Kuroko no Basket", "Kuroko no Basuke", "Kuroko's Basketball"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "grand-blue",
    titleRu: "Необъятный океан",
    titleEn: "Grand Blue",
    titleJp: "Gurando Burū",
    aliases: ["Необъятный океан", "Гранд Блю", "Grand Blue", "Grand Blue Dreaming"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "erased",
    titleRu: "Город, в котором меня нет",
    titleEn: "Erased",
    titleJp: "Boku dake ga Inai Machi",
    aliases: ["Город, в котором меня нет", "Город в котором меня нет", "Boku dake ga Inai Machi", "Erased"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "rezero",
    titleRu: "Re:Zero. Жизнь с нуля в альтернативном мире",
    titleEn: "Re:Zero − Starting Life in Another World",
    titleJp: "Re:Zero kara Hajimeru Isekai Seikatsu",
    aliases: ["Re:Zero", "Ре:Зеро", "Жизнь с нуля в альтернативном мире", "Re:Zero kara Hajimeru Isekai Seikatsu", "Re Zero"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "sword-art-online",
    titleRu: "Sword Art Online. Мастера Меча Онлайн",
    titleEn: "Sword Art Online",
    titleJp: "Sōdo Āto Onrain",
    aliases: ["Мастера Меча Онлайн", "Sword Art Online", "SAO", "САО", "Sword Art Online: Progressive"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "overlord",
    titleRu: "Overlord. Повелитель",
    titleEn: "Overlord",
    titleJp: "Ōbārōdo",
    aliases: ["Повелитель", "Оверлорд", "Overlord"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "no-game-no-life",
    titleRu: "Без игры жизни нет",
    titleEn: "No Game No Life",
    titleJp: "Nō Gēmu Nō Raifu",
    aliases: ["Нет игры — нет жизни", "Нет игры нет жизни", "Без игры жизни нет", "No Game No Life", "NGNL"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "spice-and-wolf",
    titleRu: "Волчица и пряности",
    titleEn: "Spice and Wolf",
    titleJp: "Ookami to Koushinryou",
    aliases: ["Волчица и пряности", "Пряности и волчица", "Ookami to Koushinryou", "Spice and Wolf"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "dragon-maid",
    titleRu: "Дракон-горничная госпожи Кобаяси",
    titleEn: "Miss Kobayashi's Dragon Maid",
    titleJp: "Kobayashi-san Chi no Maid Dragon",
    aliases: ["Дракон-горничная госпожи Кобаяси", "Дракониха-горничная госпожи Кобаяши", "Kobayashi-san Chi no Maid Dragon", "Miss Kobayashi's Dragon Maid"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "danmachi",
    titleRu: "Может, я встречу тебя в подземелье?",
    titleEn: "Is It Wrong to Try to Pick Up Girls in a Dungeon?",
    titleJp: "Dungeon ni Deai wo Motomeru no wa Machigatteiru Darou ka",
    aliases: ["В подземелье я пойду, там красавицу найду", "Может, я встречу тебя в подземелье?", "DanMachi", "Данмачи"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "oregairu",
    titleRu: "Как и ожидал, моя школьная романтическая жизнь не удалась",
    titleEn: "My Youth Romantic Comedy Is Wrong, As I Expected",
    titleJp: "Yahari Ore no Seishun Love Come wa Machigatteiru.",
    aliases: ["Орегайру", "Oregairu", "Розовая пора моей школьной жизни сплошной обман", "Yahari Ore no Seishun Love Comedy wa Machigatteiru."],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "happy-sugar-life",
    titleRu: "Сладкая жизнь",
    titleEn: "Happy Sugar Life",
    titleJp: "Happī Shugā Raifu",
    aliases: ["Сладкая жизнь", "Happy Sugar Life"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "blue-exorcist",
    titleRu: "Синий экзорцист",
    titleEn: "Blue Exorcist",
    titleJp: "Ao no Ekusoshisuto",
    aliases: ["Синий экзорцист", "Ao no Exorcist", "Blue Exorcist"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "dr-stone",
    titleRu: "Доктор Стоун",
    titleEn: "Dr. STONE",
    titleJp: "Dokutā Sutōn",
    aliases: ["Доктор Стоун", "Dr. Stone", "Dr. STONE", "Dr Stone"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "grandmaster-of-demonic-cultivation",
    titleRu: "Магистр дьявольского культа",
    titleEn: "Grandmaster of Demonic Cultivation",
    titleJp: "Mo Dao Zu Shi",
    aliases: ["Магистр дьявольского культа", "Мо Дао Цзу Ши", "Mo Dao Zu Shi", "The Untamed", "Неукротимый"],
    publisher: "Истари Комикс",
    type: "manhua"
  },
  {
    id: "heaven-officials-blessing",
    titleRu: "Благословение небожителей",
    titleEn: "Heaven Official's Blessing",
    titleJp: "Tian Guan Ci Fu",
    aliases: ["Благословение небожителей", "Тянь Гуань Цы Фу", "Tian Guan Ci Fu", "TGCF"],
    publisher: "Комильфо",
    type: "manhua"
  },
  {
    id: "scum-villain",
    titleRu: "Система «Спаси-Себя-Сам» для Главного Злодея",
    titleEn: "The Scum Villain's Self-Saving System",
    titleJp: "Ren Zha Fanpai Zijiu Xitong",
    aliases: ["Система Спаси-Себя-Сам для Главного Злодея", "Система Спаси Себя Сам", "Scum Villain", "Scum Villain's Self-Saving System", "SVSSS"],
    publisher: "Истари Комикс",
    type: "manhua"
  },

  // --- АСТ / MAINSTREAM (МАНХВЫ И ВЕБТУНЫ) ---
  {
    id: "solo-leveling",
    titleRu: "Поднятие уровня в одиночку",
    titleEn: "Solo Leveling",
    titleJp: "Na Honjamanman Rebeleop",
    aliases: ["Поднятие уровня в одиночку", "Только я возьму новый уровень", "Только я возьму 100 уровень", "Solo Leveling", "SoloLeveling", "I Level Up Alone", "Нашествие монстров", "Только я повышаю уровень"],
    publisher: "АСТ Mainstream",
    type: "manhwa"
  },
  {
    id: "omniscient-reader",
    titleRu: "Всеведущий читатель",
    titleEn: "Omniscient Reader's Viewpoint",
    titleJp: "Jeonjijeok Dokja Sijeom",
    aliases: ["Всеведущий читатель", "Точка зрения всеведущего читателя", "Взгляд всеведущего читателя", "Omniscient Reader's Viewpoint", "Omniscient Reader", "ORV"],
    publisher: "АСТ Mainstream",
    type: "manhwa"
  },
  {
    id: "bastard",
    titleRu: "Ублюдок",
    titleEn: "Bastard",
    titleJp: "Huryejasik",
    aliases: ["Ублюдок", "Bastard", "Сволочь"],
    publisher: "АСТ Mainstream",
    type: "manhwa"
  },
  {
    id: "sweet-home",
    titleRu: "Милый дом",
    titleEn: "Sweet Home",
    titleJp: "Seuwiteuhom",
    aliases: ["Милый дом", "Sweet Home"],
    publisher: "АСТ Mainstream",
    type: "manhwa"
  },
  {
    id: "lore-olympus",
    titleRu: "Предания Олимпа",
    titleEn: "Lore Olympus",
    titleJp: "Lore Olympus",
    aliases: ["Предания Олимпа", "Сказания Олимпа", "Lore Olympus"],
    publisher: "АСТ Mainstream",
    type: "manhwa"
  },
  {
    id: "noblesse",
    titleRu: "Дворянство",
    titleEn: "Noblesse",
    titleJp: "Nobeulleseu",
    aliases: ["Дворянство", "Ноблесс", "Noblesse"],
    publisher: "АСТ Mainstream",
    type: "manhwa"
  },
  {
    id: "tower-of-god",
    titleRu: "Башня Бога",
    titleEn: "Tower of God",
    titleJp: "Sin-ui Tap",
    aliases: ["Башня Бога", "Башня бога", "Tower of God", "Sin-ui Tap", "Kami no Tou", "TOG"],
    publisher: "АСТ Mainstream",
    type: "manhwa"
  },
  {
    id: "villains-destined-to-die",
    titleRu: "Единственный исход злодейки — смерть",
    titleEn: "Villains Are Destined to Die",
    titleJp: "Ak-yeog-ui Gyeolmal-eun Samangppun-ida",
    aliases: ["Единственный исход злодейки — смерть", "Смерть — единственный конец для злодейки", "Единственный исход злодейки смерть", "Villains Are Destined to Die", "Death Is the Only Ending for the Villainess"],
    publisher: "АСТ Mainstream",
    type: "manhwa"
  },
  {
    id: "who-made-me-a-princess",
    titleRu: "Однажды я стала принцессой",
    titleEn: "Who Made Me a Princess",
    titleJp: "Eoneu Nal Gongjuga Doeeobeoryeotda",
    aliases: ["Однажды я стала принцессой", "Кто сделал меня принцессой?", "Однажды я превратилась в принцессу", "Who Made Me a Princess", "Suddenly Became a Princess"],
    publisher: "АСТ Mainstream",
    type: "manhwa"
  },
  {
    id: "killing-stalking",
    titleRu: "Убить сталкера",
    titleEn: "Killing Stalking",
    titleJp: "Kilring Seutoking",
    aliases: ["Убить сталкера", "Killing Stalking"],
    publisher: "АСТ Mainstream",
    type: "manhwa"
  },
  {
    id: "painter-of-the-night",
    titleRu: "Ночные этюды",
    titleEn: "Painter of the Night",
    titleJp: "Yashik",
    aliases: ["Ночные этюды", "Ночной художник", "Painter of the Night"],
    publisher: "АСТ Mainstream",
    type: "manhwa"
  },
  {
    id: "wind-breaker",
    titleRu: "Ветролом",
    titleEn: "Wind Breaker",
    titleJp: "Wind Breaker",
    aliases: ["Ветролом", "Виндобрейкер", "Wind Breaker", "Windbreaker"],
    publisher: "АСТ Mainstream",
    type: "manhwa"
  },
  {
    id: "lookism",
    titleRu: "Лукизм",
    titleEn: "Lookism",
    titleJp: "Oemojisangjuui",
    aliases: ["Лукизм", "Внешность", "Lookism"],
    publisher: "АСТ Mainstream",
    type: "manhwa"
  },
  {
    id: "eleceed",
    titleRu: "Элисед",
    titleEn: "Eleceed",
    titleJp: "Ilreksideu",
    aliases: ["Элисед", "Eleceed"],
    publisher: "АСТ Mainstream",
    type: "manhwa"
  },
  {
    id: "true-beauty",
    titleRu: "Истинная красота",
    titleEn: "True Beauty",
    titleJp: "Yeosin-gangrim",
    aliases: ["Истинная красота", "Богиня сошествия", "True Beauty", "The Secret of Angel"],
    publisher: "АСТ Mainstream",
    type: "manhwa"
  },
  {
    id: "marry-my-husband",
    titleRu: "Замуж за моего мужа",
    titleEn: "Marry My Husband",
    titleJp: "Nae Nampyeon-gwa Gyeolhonhae-jwo",
    aliases: ["Замуж за моего мужа", "Выходи замуж за моего супруга", "Marry My Husband"],
    publisher: "АСТ Mainstream",
    type: "manhwa"
  },
  {
    id: "how-to-get-my-husband-on-my-side",
    titleRu: "Как переманить мужа на свою сторону",
    titleEn: "How to Win My Husband Over",
    titleJp: "Nampyeon-eul Nae Pyeon-euro Mandeuneun Bangbeob",
    aliases: ["Как переманить мужа на свою сторону", "Как привлечь мужа на свою сторону", "How to Win My Husband Over", "How to Get My Husband on My Side"],
    publisher: "АСТ Mainstream",
    type: "manhwa"
  },
  {
    id: "blood-bank",
    titleRu: "Банк крови",
    titleEn: "Blood Bank",
    titleJp: "Blood Bank",
    aliases: ["Банк крови", "Blood Bank"],
    publisher: "АСТ Mainstream",
    type: "manhwa"
  },

  // --- ALT GRAPH ---
  {
    id: "dorohedoro",
    titleRu: "Дорохедоро",
    titleEn: "Dorohedoro",
    titleJp: "Dorohedoro",
    aliases: ["Дорохедоро", "Dorohedoro"],
    publisher: "Alt Graph",
    type: "manga"
  },
  {
    id: "oyasumi-punpun",
    titleRu: "Спокойной ночи, Пунпун",
    titleEn: "Goodnight Punpun",
    titleJp: "Oyasumi Punpun",
    aliases: ["Спокойной ночи, Пунпун", "Спокойной ночи Пунпун", "Oyasumi Punpun", "Goodnight Punpun", "Пунпун"],
    publisher: "Alt Graph",
    type: "manga"
  },
  {
    id: "solanin",
    titleRu: "Соланин",
    titleEn: "Solanin",
    titleJp: "Soranin",
    aliases: ["Соланин", "Solanin"],
    publisher: "Alt Graph",
    type: "manga"
  },
  {
    id: "a-girl-on-the-shore",
    titleRu: "Девушка у моря",
    titleEn: "A Girl on the Shore",
    titleJp: "Umibe no Onnanoko",
    aliases: ["Девушка у моря", "Umibe no Onnanoko", "A Girl on the Shore"],
    publisher: "Alt Graph",
    type: "manga"
  },
  {
    id: "barefoot-gen",
    titleRu: "Босоногий Гэн",
    titleEn: "Barefoot Gen",
    titleJp: "Hadashi no Gen",
    aliases: ["Босоногий Гэн", "Босоногий Ген", "Hadashi no Gen", "Barefoot Gen"],
    publisher: "Alt Graph",
    type: "manga"
  },

  // --- ФАБРИКА КОМИКСОВ ---
  {
    id: "hellsing",
    titleRu: "Хеллсинг",
    titleEn: "Hellsing",
    titleJp: "Herushingu",
    aliases: ["Хеллсинг", "Хелсинг", "Hellsing"],
    publisher: "Фабрика комиксов",
    type: "manga"
  },
  {
    id: "drifters",
    titleRu: "Скитальцы",
    titleEn: "Drifters",
    titleJp: "Dorifutāzu",
    aliases: ["Скитальцы", "Drifters"],
    publisher: "Фабрика комиксов",
    type: "manga"
  },
  {
    id: "trigun",
    titleRu: "Триган",
    titleEn: "Trigun",
    titleJp: "Toraigan",
    aliases: ["Триган", "Trigun", "Trigun Maximum"],
    publisher: "Фабрика комиксов",
    type: "manga"
  },
  {
    id: "mirai-nikki",
    titleRu: "Дневник будущего",
    titleEn: "Future Diary",
    titleJp: "Mirai Nikki",
    aliases: ["Дневник будущего", "Mirai Nikki", "Future Diary"],
    publisher: "Фабрика комиксов",
    type: "manga"
  },
  {
    id: "black-lagoon",
    titleRu: "Пираты «Чёрной лагуны»",
    titleEn: "Black Lagoon",
    titleJp: "Burakku Ragūn",
    aliases: ["Пираты «Чёрной лагуны»", "Пираты Черной лагуны", "Черная лагуна", "Black Lagoon"],
    publisher: "Фабрика комиксов",
    type: "manga"
  },
  {
    id: "toradora",
    titleRu: "Торадора!",
    titleEn: "Toradora!",
    titleJp: "Toradora!",
    aliases: ["Торадора", "Торадора!", "Toradora!", "Toradora"],
    publisher: "Фабрика комиксов",
    type: "manga"
  },
  {
    id: "another",
    titleRu: "Иная",
    titleEn: "Another",
    titleJp: "Anazā",
    aliases: ["Иная", "Another"],
    publisher: "Фабрика комиксов",
    type: "manga"
  },
  {
    id: "battle-royale",
    titleRu: "Королевская битва",
    titleEn: "Battle Royale",
    titleJp: "Batoru Rowaiaru",
    aliases: ["Королевская битва", "Battle Royale"],
    publisher: "Фабрика комиксов",
    type: "manga"
  },

  // --- ЭКСМО / FREEDOM / ДРУГИЕ ОФИЦИАЛЬНЫЕ ЛИЦЕНЗИИ ---
  {
    id: "bleach",
    titleRu: "Блич",
    titleEn: "Bleach",
    titleJp: "Burīchi",
    aliases: ["Блич", "Bleach"],
    publisher: "Эксмо / Азбука",
    type: "manga"
  },
  {
    id: "parasyte",
    titleRu: "Паразит",
    titleEn: "Parasyte",
    titleJp: "Kiseijuu",
    aliases: ["Паразит", "Учение о жизни", "Kiseijuu", "Parasyte"],
    publisher: "Эксмо",
    type: "manga"
  },
  {
    id: "frieren",
    titleRu: "Фрирен, провожающая в последний путь",
    titleEn: "Frieren: Beyond Journey's End",
    titleJp: "Sousou no Frieren",
    aliases: ["Фрирен", "Провожающая в последний путь Фрирен", "Фрирен, провожающая в последний путь", "Sousou no Frieren", "Frieren: Beyond Journey's End", "Frieren"],
    publisher: "АСТ / Эксмо",
    type: "manga"
  },
  {
    id: "kaiju-no-8",
    titleRu: "Кайдзю №8",
    titleEn: "Kaiju No. 8",
    titleJp: "Kaijuu 8-gou",
    aliases: ["Кайдзю №8", "Кайдзю 8", "Монстр №8", "Kaiju No. 8", "Monster #8"],
    publisher: "АСТ",
    type: "manga"
  },
  {
    id: "jigokuraku",
    titleRu: "Адский рай",
    titleEn: "Hell's Paradise: Jigokuraku",
    titleJp: "Jigokuraku",
    aliases: ["Адский рай", "Jigokuraku", "Hell's Paradise"],
    publisher: "Азбука",
    type: "manga"
  },
  {
    id: "dandadan",
    titleRu: "Дандадан",
    titleEn: "Dandadan",
    titleJp: "Dandadan",
    aliases: ["Дандадан", "Dandadan", "Dan Da Dan"],
    publisher: "АСТ",
    type: "manga"
  },
  {
    id: "mashle",
    titleRu: "Магия и мускулы",
    titleEn: "Mashle: Magic and Muscles",
    titleJp: "Makkusu",
    aliases: ["Магия и мускулы", "Мэшл", "Mashle", "Mashle: Magic and Muscles"],
    publisher: "АСТ",
    type: "manga"
  },
  {
    id: "sakamoto-days",
    titleRu: "Дни Сакамото",
    titleEn: "Sakamoto Days",
    titleJp: "Sakamoto Deizu",
    aliases: ["Сакамото Дейз", "Дни Сакамото", "Sakamoto Days"],
    publisher: "АСТ",
    type: "manga"
  },
  {
    id: "oshi-no-ko",
    titleRu: "Звёздное дитя",
    titleEn: "Oshi no Ko",
    titleJp: "Oshi no Ko",
    aliases: ["Звёздное дитя", "Звездное дитя", "Оши но Ко", "Oshi no Ko", "Мой кумир"],
    publisher: "АСТ",
    type: "manga"
  },
  {
    id: "apothecary-diaries",
    titleRu: "Монолог фармацевта",
    titleEn: "The Apothecary Diaries",
    titleJp: "Kusuriya no Hitorigoto",
    aliases: ["Записки аптекаря", "Монолог фармацевта", "Дневник аптекаря", "Kusuriya no Hitorigoto", "The Apothecary Diaries"],
    publisher: "АСТ",
    type: "manga"
  },
  {
    id: "my-dress-up-darling",
    titleRu: "Эта фарфоровая кукла влюбилась",
    titleEn: "My Dress-Up Darling",
    titleJp: "Sono Bisque Doll wa Koi wo Suru",
    aliases: ["Любовь с иголочки", "Эта фарфоровая кукла влюбилась", "Sono Bisque Doll wa Koi wo Suru", "My Dress-Up Darling"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "dangers-in-my-heart",
    titleRu: "Опасность в моём сердце",
    titleEn: "The Dangers in My Heart",
    titleJp: "Boku no Kokoro no Yabai Yatsu",
    aliases: ["Опасность в моем сердце", "Опасность в моём сердце", "Boku no Kokoro no Yabai Yatsu", "The Dangers in My Heart"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "komi-cant-communicate",
    titleRu: "У Коми проблемы с общением",
    titleEn: "Komi Can't Communicate",
    titleJp: "Komi-san wa, Komyushou desu.",
    aliases: ["У Коми проблемы с общением", "Коми не умеет общаться", "Komi Can't Communicate", "Komi-san wa, Komyushou desu."],
    publisher: "Эксмо",
    type: "manga"
  },
  {
    id: "nagatoro",
    titleRu: "Не издевайся, Нагаторо",
    titleEn: "Don't Toy with Me, Miss Nagatoro",
    titleJp: "Ijiranaide, Nagatoro-san",
    aliases: ["Не издевайся, Нагаторо", "Не дразни меня, Нагаторо-сан", "Ijiranaide, Nagatoro-san", "Don't Toy with Me, Miss Nagatoro"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "assassination-classroom",
    titleRu: "Класс убийц",
    titleEn: "Assassination Classroom",
    titleJp: "Ansatsu Kyoushitsu",
    aliases: ["Класс убийц", "Ansatsu Kyoushitsu", "Assassination Classroom"],
    publisher: "Азбука",
    type: "manga"
  },
  {
    id: "fire-force",
    titleRu: "Пламенный отряд",
    titleEn: "Fire Force",
    titleJp: "Enen no Shouboutai",
    aliases: ["Пламенный отряд", "Пламенная бригада пожарных", "Enen no Shouboutai", "Fire Force"],
    publisher: "Азбука",
    type: "manga"
  },
  {
    id: "gto",
    titleRu: "Крутой учитель Онидзука",
    titleEn: "Great Teacher Onizuka",
    titleJp: "Gurēto Chīchā Onizuka",
    aliases: ["Крутой учитель Онидзука", "Онидзука", "GTO", "Great Teacher Onizuka"],
    publisher: "Азбука",
    type: "manga"
  },
  {
    id: "slam-dunk",
    titleRu: "Слэм-данк",
    titleEn: "Slam Dunk",
    titleJp: "Suramu Danku",
    aliases: ["Слэм данк", "Слэм-данк", "Slam Dunk"],
    publisher: "Азбука",
    type: "manga"
  },
  {
    id: "banana-fish",
    titleRu: "Банановая рыба",
    titleEn: "Banana Fish",
    titleJp: "Banana Fish",
    aliases: ["Банановая рыба", "Banana Fish"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "fruits-basket",
    titleRu: "Корзинка фруктов",
    titleEn: "Fruits Basket",
    titleJp: "Furūtsu Basuketto",
    aliases: ["Корзинка фруктов", "Fruits Basket"],
    publisher: "Азбука",
    type: "manga"
  },
  {
    id: "black-butler",
    titleRu: "Тёмный дворецкий",
    titleEn: "Black Butler",
    titleJp: "Kuroshitsuji",
    aliases: ["Тёмный дворецкий", "Темный дворецкий", "Kuroshitsuji", "Black Butler"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "vampire-knight",
    titleRu: "Рыцарь-вампир",
    titleEn: "Vampire Knight",
    titleJp: "Vanpaia Naito",
    aliases: ["Рыцарь-вампир", "Рыцарь вампир", "Vampire Knight"],
    publisher: "Эксмо",
    type: "manga"
  },
  {
    id: "gintama",
    titleRu: "Гинтама",
    titleEn: "Gintama",
    titleJp: "Gintama",
    aliases: ["Гинтама", "Gintama", "Серебряная душа"],
    publisher: "Азбука",
    type: "manga"
  },
  {
    id: "hunter-x-hunter",
    titleRu: "Охотник х Охотник",
    titleEn: "Hunter x Hunter",
    titleJp: "Hantā Hantā",
    aliases: ["Охотник х Охотник", "Хантер х Хантер", "Hunter x Hunter", "Hunter × Hunter", "HXH"],
    publisher: "Азбука",
    type: "manga"
  },
  {
    id: "mushoku-tensei",
    titleRu: "Реинкарнация безработного",
    titleEn: "Mushoku Tensei: Jobless Reincarnation",
    titleJp: "Mushoku Tensei: Isekai Ittara Honki Dasu",
    aliases: ["Реинкарнация безработного", "Mushoku Tensei", "Jobless Reincarnation", "История о приключениях в другом мире"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "eminence-in-shadow",
    titleRu: "Восхождение в тени!",
    titleEn: "The Eminence in Shadow",
    titleJp: "Kage no Jitsuryokusha ni Naritakute!",
    aliases: ["Восхождение в тени", "Восхождение в тени!", "The Eminence in Shadow", "Kage no Jitsuryokusha ni Naritakute"],
    publisher: "Истари Комикс",
    type: "manga"
  },
  {
    id: "so-im-a-spider",
    titleRu: "Да, я паук, и что же?",
    titleEn: "So I'm a Spider, So What?",
    titleJp: "Kumo desu ga, Nani ka?",
    aliases: ["Да, я паук, и что?", "Да я паук и что же?", "Kumo desu ga, Nani ka?", "So I'm a Spider, So What?"],
    publisher: "Истари Комикс",
    type: "manga"
  }
];

// Helper to normalize any title for robust matching
export function normalizeLicensedTitle(s: string): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s*[\(\[\{][^\)\]\}]*[\)\]\}]\s*/g, " ")
    .replace(/\b(манга|манхва|маньхуа|вебтун|веб комикс|manga|manhwa|manhua|webtoon|webcomic|онгоинг|ongoing|сериал|сезон|season|tv|тв|ремейк|remake|дубляж|перевод|official|release|глава|chapter|vol|volume|том)\b/gi, " ")
    .replace(/[^a-zа-я0-9]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Check if a given title or array of titles is in the licensed blocklist
export function checkIsMangaLicensed(titles: (string | undefined | null)[]): { isLicensed: boolean; item?: LicensedMangaItem } {
  const cleanQueries = titles
    .filter(Boolean)
    .map(t => normalizeLicensedTitle(String(t)))
    .filter(t => t.length >= 2);

  if (cleanQueries.length === 0) return { isLicensed: false };

  for (const item of LICENSED_MANGA_LIST) {
    const allItemNames = [
      item.titleRu,
      item.titleEn,
      item.titleJp,
      ...(item.aliases || [])
    ].filter(Boolean).map(n => normalizeLicensedTitle(String(n))).filter(n => n.length >= 2);

    for (const q of cleanQueries) {
      for (const itemName of allItemNames) {
        // Exact match
        if (q === itemName) {
          return { isLicensed: true, item };
        }

        // Substring / Word-boundary match for titles with length >= 4
        if (itemName.length >= 4 && q.length >= 4) {
          if (q.startsWith(itemName + " ") || q.endsWith(" " + itemName) || q === itemName) {
            return { isLicensed: true, item };
          }
          if (itemName.startsWith(q + " ") || itemName.endsWith(" " + q)) {
            return { isLicensed: true, item };
          }
        }
      }
    }
  }

  return { isLicensed: false };
}
