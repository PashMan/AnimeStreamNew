// Basic Russian profanity list for demonstration
// In a real application, this should be more comprehensive and ideally handled server-side.
const BAD_WORDS = [
  'блять', 'бля', 'сука', 'ебать', 'ебан', 'пиздец', 'пидор', 'хуй', 'хуйня', 'пизда',
  'мудак', 'гандон', 'шлюха', 'залупа', 'долбаеб', 'хуесос', 'уебок', 'пидорас', 'хер',
  'блядь', 'ебаный', 'ебаная', 'ебаное', 'ебаные', 'ебанутый', 'ебанутая', 'ебанутое', 'ебанутые',
  'пиздеть', 'спиздить', 'нахуй', 'похуй', 'хуево', 'охуенно', 'охуеть', 'охуел', 'охуела',
  'пиздобол', 'пиздолиз', 'пиздострадалец', 'пиздобратия', 'пиздокрыл', 'пиздоглазый',
  'еблан', 'еблыст', 'еблыстик', 'еблысточка', 'еблыстушка', 'еблыстушечка', 'еблыстушеночка',
  'еблыстушеночечка', 'еблыстушеночечечка', 'еблыстушеночечечечка'
];

export const containsProfanity = (text: string): boolean => {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  
  return BAD_WORDS.some(word => {
    // For very short words, use word boundaries to avoid false positives
    if (word.length <= 3) {
      const regex = new RegExp(`(?:^|\\s|[.,!?_\\-])${word}(?:$|\\s|[.,!?_\\-])`, 'i');
      return regex.test(lowerText);
    }
    // For longer words, a simple substring check is often more effective for Russian
    return lowerText.includes(word);
  });
};

export const filterProfanity = (text: string): string => {
  if (!text) return text;
  let filteredText = text;
  
  // Sort by length descending so longer words are replaced first
  const sortedWords = [...BAD_WORDS].sort((a, b) => b.length - a.length);
  
  sortedWords.forEach(word => {
    if (word.length <= 3) {
      const regex = new RegExp(`(^|\\s|[.,!?_\\-])(${word})($|\\s|[.,!?_\\-])`, 'gi');
      filteredText = filteredText.replace(regex, (match, p1, p2, p3) => {
        return p1 + '*'.repeat(p2.length) + p3;
      });
    } else {
      const regex = new RegExp(word, 'gi');
      filteredText = filteredText.replace(regex, '*'.repeat(word.length));
    }
  });
  
  return filteredText;
};
