import { User } from '../types';

export interface PrefixOption {
  id: string;
  name: string;
  color: string;
  borderColor: string;
  bgColor: string;
  description: string;
  isCustom?: boolean;
}

export const AVAILABLE_PREFIXES: PrefixOption[] = [
  {
    id: 'newgen',
    name: 'Ньюген',
    color: '#38BDF8',
    borderColor: '#38BDF840',
    bgColor: '#38BDF820',
    description: 'Выдается сразу при регистрации каждому пользователю'
  },
  {
    id: 'first_aid',
    name: 'Первая помощь',
    color: '#F43F5E',
    borderColor: '#F43F5E40',
    bgColor: '#F43F5E20',
    description: 'За покупку Премиум-подписки'
  },
  {
    id: 'mangaka',
    name: 'Мангака',
    color: '#EC4899',
    borderColor: '#EC489940',
    bgColor: '#EC489920',
    description: 'За переход к чтению манги'
  },
  {
    id: 'oldtimer',
    name: 'Старожила',
    color: '#F59E0B',
    borderColor: '#F59E0B40',
    bgColor: '#F59E0B20',
    description: 'За 2 месяца на сайте'
  },
  {
    id: 'otaku',
    name: 'Отаку',
    color: '#8B5CF6',
    borderColor: '#8B5CF640',
    bgColor: '#8B5CF620',
    description: 'За просмотр 300 тайтлов аниме'
  },
  {
    id: 'true_connoisseur',
    name: 'Истинный ценитель',
    color: '#10B981',
    borderColor: '#10B98140',
    bgColor: '#10B98120',
    description: 'За просмотр Блича, Наруто и Ван-Писа (основные серии)'
  },
  {
    id: 'instigator',
    name: 'Заводила',
    color: '#F97316',
    borderColor: '#F9731640',
    bgColor: '#F9731620',
    description: 'За создание комнаты в совместном просмотре'
  },
  {
    id: 'fan_rezero',
    name: 'Фанат Re:Zero',
    color: '#6366F1',
    borderColor: '#6366F140',
    bgColor: '#6366F120',
    description: 'За просмотр основных сезонов Re:Zero'
  },
  {
    id: 'fan_aot',
    name: 'Фанат Атаки титанов',
    color: '#EF4444',
    borderColor: '#EF444440',
    bgColor: '#EF444420',
    description: 'За просмотр основных сезонов Атаки титанов'
  },
  {
    id: 'fan_naruto',
    name: 'Фанат Наруто',
    color: '#EAB308',
    borderColor: '#EAB30840',
    bgColor: '#EAB30820',
    description: 'За просмотр всех основных серий Наруто'
  },
  {
    id: 'fan_bleach',
    name: 'Фанат Блича',
    color: '#06B6D4',
    borderColor: '#06B6D440',
    bgColor: '#06B6D420',
    description: 'За просмотр всех основных серий Блича'
  },
  {
    id: 'fan_onepiece',
    name: 'Фанат Ван-Писа',
    color: '#3B82F6',
    borderColor: '#3B82F640',
    bgColor: '#3B82F620',
    description: 'За просмотр всех основных серий Ван-Писа'
  },
  {
    id: 'custom',
    name: 'Свой титул',
    color: '#A855F7',
    borderColor: '#A855F740',
    bgColor: '#A855F720',
    description: 'Возможность написать собственный титул (за Премиум)',
    isCustom: true
  }
];

export function getDisplayTitle(user?: User | null): string {
  if (!user) return 'Ньюген';
  if (user.customPrefix === 'Свой титул' && user.customTitleText?.trim()) {
    return user.customTitleText.trim();
  }
  return user.customPrefix || 'Ньюген';
}

export function evaluateUnlockedTitles(user: User, actionTrigger?: 'mangaka' | 'instigator' | 'premium'): string[] {
  const unlocked = new Set<string>(user.unlockedPrefixes || ['newgen']);
  
  // 1. Ньюген - always unlocked
  unlocked.add('newgen');
  
  // 2. Первая помощь & Свой титул - unlocked if Premium or premium trigger
  if (user.isPremium || actionTrigger === 'premium') {
    unlocked.add('first_aid');
    unlocked.add('custom');
  }

  // 3. Мангака - unlocked on manga action or trigger
  if (actionTrigger === 'mangaka') {
    unlocked.add('mangaka');
  }

  // 4. Заводила - unlocked when creating watch party room
  if (actionTrigger === 'instigator') {
    unlocked.add('instigator');
  }

  // 5. Старожила - 2 months (60 days) on site
  if (user.createdAt) {
    const createdTime = new Date(user.createdAt).getTime();
    if (!isNaN(createdTime)) {
      const daysOld = (Date.now() - createdTime) / (1000 * 60 * 60 * 24);
      if (daysOld >= 60) {
        unlocked.add('oldtimer');
      }
    }
  }

  // 6. Отаку - 300 watched anime
  const watchedCount = Math.max(
    user.watchedAnimeIds?.length || 0,
    user.episodesWatched || 0
  );
  if (watchedCount >= 300) {
    unlocked.add('otaku');
  }

  // 7. Franchise titles ("Фанат ...")
  const watchedList = user.watchedAnimeIds || [];
  const watchedJoined = watchedList.join(' ').toLowerCase();

  if (watchedJoined.includes('re:zero') || watchedJoined.includes('rezero') || watchedJoined.includes('5818') || watchedJoined.includes('31240')) {
    unlocked.add('fan_rezero');
  }
  if (watchedJoined.includes('attack') || watchedJoined.includes('titan') || watchedJoined.includes('16498') || watchedJoined.includes('атака')) {
    unlocked.add('fan_aot');
  }
  if (watchedJoined.includes('naruto') || watchedJoined.includes('20') || watchedJoined.includes('наруто')) {
    unlocked.add('fan_naruto');
  }
  if (watchedJoined.includes('bleach') || watchedJoined.includes('269') || watchedJoined.includes('блич')) {
    unlocked.add('fan_bleach');
  }
  if (watchedJoined.includes('one piece') || watchedJoined.includes('one-piece') || watchedJoined.includes('21') || watchedJoined.includes('ванпис') || watchedJoined.includes('ван-пис')) {
    unlocked.add('fan_onepiece');
  }

  // 8. Истинный ценитель - Bleach + Naruto + One Piece
  if (unlocked.has('fan_bleach') && unlocked.has('fan_naruto') && unlocked.has('fan_onepiece')) {
    unlocked.add('true_connoisseur');
  }

  return Array.from(unlocked);
}
