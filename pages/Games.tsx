import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Sparkles, Trophy, RotateCcw, Crown, Heart, Star, Flame, Eye, ShoppingBag, ShieldCheck, Check, Gamepad2 } from 'lucide-react';
import SEO from '../components/SEO';
import { useAuth } from '../context/AuthContext';

interface GameItem {
  id: string;
  title: string;
  developer: string;
  genre: string;
  rating: number;
  image: string;
  downloads: string;
  isPremium?: boolean;
}

const FEATURED_GAMES: GameItem[] = [
  {
    id: 'g-1',
    title: 'Solo Leveling: Arise',
    developer: 'Netmarble',
    genre: 'Экшен RPG',
    rating: 4.8,
    image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80',
    downloads: '10M+',
    isPremium: false
  },
  {
    id: 'g-2',
    title: 'My Hero Academia: TSH',
    developer: 'Sony Pictures',
    genre: 'Сражения / Аниме боевик',
    rating: 4.6,
    image: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=800&auto=format&fit=crop&q=80',
    downloads: '5M+',
    isPremium: true
  },
  {
    id: 'g-3',
    title: 'Street Fighter: Duel',
    developer: 'Capcom',
    genre: 'РПГ / Карточные бои',
    rating: 4.5,
    image: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80',
    downloads: '2M+',
    isPremium: false
  },
  {
    id: 'g-4',
    title: 'One Punch Man: World',
    developer: 'Perfect World',
    genre: 'Мультиплеер экшен',
    rating: 4.7,
    image: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800&auto=format&fit=crop&q=80',
    downloads: '5M+',
    isPremium: true
  }
];

// Card memory game items
const GAME_CARDS = [
  { id: 1, name: 'Luffy', icon: '☠️' },
  { id: 2, name: 'Naruto', icon: '🦊' },
  { id: 3, name: 'Goku', icon: '⚡' },
  { id: 4, name: 'Deku', icon: '🥦' },
  { id: 5, name: 'Tanjiro', icon: '🌊' },
  { id: 6, name: 'Chainsaw', icon: '🪚' },
  { id: 7, name: 'Luffy', icon: '☠️' },
  { id: 8, name: 'Naruto', icon: '🦊' },
  { id: 9, name: 'Goku', icon: '⚡' },
  { id: 10, name: 'Deku', icon: '🥦' },
  { id: 11, name: 'Tanjiro', icon: '🌊' },
  { id: 12, name: 'Chainsaw', icon: '🪚' }
];

const Games: React.FC = () => {
  const { user } = useAuth();
  
  // Memory Game State
  const [cards, setCards] = useState(() => [...GAME_CARDS].sort(() => Math.random() - 0.5));
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [score, setScore] = useState(0);
  const [gameCompleted, setGameCompleted] = useState(false);

  const resetGame = () => {
    setCards([...GAME_CARDS].sort(() => Math.random() - 0.5));
    setFlipped([]);
    setMatched([]);
    setMoves(0);
    setScore(0);
    setGameCompleted(false);
  };

  const handleCardClick = (index: number) => {
    if (flipped.length === 2 || flipped.includes(index) || matched.includes(index)) return;

    const newFlipped = [...flipped, index];
    setFlipped(newFlipped);

    if (newFlipped.length === 2) {
      setMoves(prev => prev + 1);
      const [firstIdx, secondIdx] = newFlipped;
      if (cards[firstIdx].name === cards[secondIdx].name) {
        setMatched(prev => [...prev, firstIdx, secondIdx]);
        setScore(prev => prev + 100);
        setFlipped([]);
        
        if (matched.length + 2 === cards.length) {
          setGameCompleted(true);
        }
      } else {
        setTimeout(() => {
          setFlipped([]);
        }, 1000);
      }
    }
  };

  return (
    <div className="bg-[#141519] min-h-screen text-slate-100 pb-24 font-sans select-none">
      <SEO 
        title="Аниме Игры Сезона Онлайн - Crunchyroll"
        description="Эксклюзивная игровая полка Crunchyroll. Играйте в захватывающие аниме игры, зарабатывайте значки и соревнуйтесь с сообществом."
      />

      {/* Hero Games Carousel Section */}
      <div className="relative overflow-hidden bg-gradient-to-r from-primary/10 via-[#141519]/90 to-[#141519] border-b border-white/5 py-16 px-4 sm:px-8 lg:px-12">
        <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7 space-y-6">
            <span className="px-3.5 py-1.5 bg-primary text-white font-black text-[10px] uppercase tracking-widest rounded-full w-fit flex items-center gap-1.5 shadow-lg shadow-primary/15">
              <Gamepad2 className="w-3.5 h-3.5" /> KamiAnime Игры
            </span>
            <h1 className="text-4xl md:text-6xl font-black text-white uppercase tracking-tight leading-none">
              Играй бесплатно <br />в любимые Аниме!
            </h1>
            <p className="text-slate-400 font-medium text-sm md:text-base leading-relaxed max-w-xl">
              Получите эксклюзивный доступ к потрясающим ролевым аниме-хитам на iOS, Android и ПК в нашей библиотеке. Никакой рекламы и скрытых микротранзакций!
            </p>
            <div className="flex flex-wrap gap-4 pt-2">
              <a href="#mini-arcade" className="px-6 py-4 bg-primary hover:bg-accent text-white font-black uppercase text-xs tracking-wider rounded-xl shadow-lg shadow-primary/20 flex items-center gap-2 transition-all">
                <Play className="w-4 h-4 text-white fill-current animate-pulse" /> Перейти в Аркаду
              </a>
            </div>
          </div>
          <div className="lg:col-span-5 relative">
            <div className="aspect-video sm:aspect-square bg-gradient-to-br from-indigo-500/20 to-primary/20 rounded-3xl p-4 border border-white/5 backdrop-blur-md relative overflow-hidden flex items-center justify-center">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl" />
              <div className="text-center space-y-4 relative z-10 p-6">
                <Trophy className="w-16 h-16 text-yellow-500 mx-auto animate-bounce" />
                <h3 className="text-2xl font-black text-white uppercase">Лидерборд Аркады</h3>
                <p className="text-xs text-slate-400">Сыграйте в мини-игру ниже, заработайте наивысший ранг и станьте легендой!</p>
                <div className="space-y-2 text-left bg-black/40 p-4 rounded-xl border border-white/5">
                  <div className="flex justify-between text-xs font-bold"><span className="text-slate-400">1. OtakuKing</span><span className="text-yellow-500">1200 pts</span></div>
                  <div className="flex justify-between text-xs font-bold"><span className="text-slate-400">2. NarutoFan99</span><span className="text-slate-400">1000 pts</span></div>
                  <div className="flex justify-between text-xs font-bold"><span className="text-slate-400">3. LeviAckerman</span><span className="text-slate-500">900 pts</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-8 lg:px-12 mt-12 space-y-16">
        
        {/* Featured Games Grid Shelf */}
        <div>
          <h2 className="text-xl font-black uppercase tracking-widest text-slate-400 mb-8 flex items-center gap-2.5">
            <span className="w-1.5 h-6 bg-primary rounded-full inline-block animate-pulse" /> Популярные игры
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {FEATURED_GAMES.map((game) => (
              <div 
                key={game.id}
                className="group relative bg-[#23252b] border border-white/5 rounded-2xl overflow-hidden hover:border-primary/50 shadow-lg hover:shadow-2xl hover:shadow-primary/5 transition-all duration-300"
              >
                <div className="relative aspect-video w-full overflow-hidden">
                  <img src={game.image} alt={game.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                  <span className="absolute bottom-3 right-3 px-2.5 py-1 bg-black/60 text-xs font-black text-white rounded-lg backdrop-blur-sm border border-white/5 flex items-center gap-1">
                    ★ {game.rating}
                  </span>
                </div>
                <div className="p-5 flex flex-col justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">
                      {game.developer} • {game.genre}
                    </span>
                    <h3 className="font-black text-lg text-white group-hover:text-primary transition-colors leading-snug">
                      {game.title}
                    </h3>
                  </div>
                  <div className="flex items-center justify-between pt-4 mt-2 border-t border-white/5">
                    <span className="text-xs text-slate-400 font-medium">Загрузки: {game.downloads}</span>
                    <button className="p-2 bg-white/5 hover:bg-primary hover:text-white rounded-lg transition-all active:scale-90">
                      <Play className="w-4.5 h-4.5 fill-current ml-0.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mini Arcades Memory Matching Game */}
        <div id="mini-arcade" className="scroll-mt-24">
          <div className="bg-[#1c1d21]/60 p-8 sm:p-12 rounded-[2.5rem] border border-white/5 shadow-2xl backdrop-blur-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl -mr-48 -mt-48" />

            <div className="max-w-4xl mx-auto space-y-10 relative z-10">
              <div className="text-center space-y-3">
                <span className="px-3 py-1 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-black text-[9px] uppercase tracking-wider rounded-lg shadow-md inline-flex items-center gap-1">
                  <Flame className="w-3 h-3 text-white fill-current animate-pulse" /> ХИТ НЕДЕЛИ
                </span>
                <h2 className="text-3xl sm:text-4xl font-black text-white uppercase tracking-tight">
                  Аркадный Матчер: Герои аниме
                </h2>
                <p className="text-slate-400 text-sm max-w-lg mx-auto">
                  Переворачивайте карты, находите одинаковые пары любимых героев и ставьте новые рекорды скорости!
                </p>
                <div className="flex justify-center items-center gap-8 pt-4">
                  <div className="text-center">
                    <div className="text-xs text-slate-500 uppercase font-extrabold tracking-wider">Сделано ходов</div>
                    <div className="text-2xl font-black text-white">{moves}</div>
                  </div>
                  <div className="w-px h-8 bg-white/10" />
                  <div className="text-center">
                    <div className="text-xs text-slate-500 uppercase font-extrabold tracking-wider">Очки Ками</div>
                    <div className="text-2xl font-black text-primary">{score} pts</div>
                  </div>
                  <div className="w-px h-8 bg-white/10" />
                  <button 
                    onClick={resetGame}
                    className="p-3 bg-[#23252b] hover:bg-primary hover:text-white rounded-2xl transition-all text-white"
                    title="Сбросить игру"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Memory Game Board Canvas layout */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4 max-w-2xl mx-auto">
                {cards.map((card, idx) => {
                  const isFlipped = flipped.includes(idx);
                  const isMatched = matched.includes(idx);
                  return (
                    <div 
                      key={idx}
                      onClick={() => handleCardClick(idx)}
                      className="aspect-square cursor-pointer relative"
                    >
                      <div className={`w-full h-full rounded-2xl transition-all duration-500 transform-style-3d relative ${isFlipped || isMatched ? 'rotate-y-180' : ''}`}>
                        
                        {/* Card Face Down */}
                        <div className="absolute inset-0 bg-[#2d3039] border border-white/10 flex items-center justify-center rounded-2xl hover:border-primary/60 hover:bg-[#343743] shadow-md z-12 backface-hidden">
                          <span className="text-primary font-black text-2xl font-display">R</span>
                        </div>

                        {/* Card Face Up */}
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/40 flex flex-col items-center justify-center rounded-2xl shadow-xl z-10 rotate-y-180 backface-hidden">
                          <span className="text-3xl mb-1">{card.icon}</span>
                          <span className="text-[10px] font-black uppercase text-slate-300 tracking-wider">{card.name}</span>
                        </div>

                      </div>
                    </div>
                  );
                })}
              </div>

              <AnimatePresence>
                {gameCompleted && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="p-8 bg-gradient-to-r from-primary/20 to-accent/20 border border-primary/40 rounded-3xl text-center max-w-md mx-auto space-y-4 shadow-2xl"
                  >
                    <div className="w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center mx-auto shadow-lg shadow-primary/20 font-black">
                      ✓
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-white uppercase">Победа! Ты пророк!</h3>
                      <p className="text-sm text-slate-400">Вы прошли Аркадный Матчер за {moves} ходов и получили {score} очков!</p>
                    </div>
                    <button onClick={resetGame} className="w-full py-3.5 bg-primary text-white font-black uppercase text-xs tracking-wider rounded-xl hover:bg-accent transition-all">
                      Сыграть Снова
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Games;
