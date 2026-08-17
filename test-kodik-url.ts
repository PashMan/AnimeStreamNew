import { fetchKodikData } from './services/kodik.js';

// ROT function used by Kodik
function convertChar(char: string, num: number): string {
  const alph = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const upper = char.toUpperCase();
  if (alph.includes(upper)) {
    const idx = (alph.indexOf(upper) + num) % alph.length;
    const ch = alph[idx];
    return char === char.toLowerCase() ? ch.toLowerCase() : ch;
  }
  return char;
}

function decodeKodikUrl(encoded: string, rotNum?: number): string {
  if (rotNum !== undefined) {
    const crypted = encoded.split('').map(c => convertChar(c, rotNum)).join('');
    const padding = (4 - (crypted.length % 4)) % 4;
    try {
      const decoded = atob(crypted + '='.repeat(padding));
      if (decoded.includes('mp4:hls:manifest')) return decoded;
    } catch {}
  }
  for (let rot = 0; rot < 26; rot++) {
    const crypted = encoded.split('').map(c => convertChar(c, rot)).join('');
    const padding = (4 - (crypted.length % 4)) % 4;
    try {
      const decoded = atob(crypted + '='.repeat(padding));
      if (decoded.includes('mp4:hls:manifest')) {
         return decoded;
      }
    } catch {}
  }
  throw new Error('Decryption of Kodik stream URL failed');
}

async function run() {
  console.log("Searching for Chainsaw Man (44511) on Kodik...");
  const results = await fetchKodikData('44511');
  if (results.length === 0) {
    console.log("No results found on Kodik for 44511.");
    return;
  }
  
  const anime = results[0];
  console.log(`Found: ${anime.translation.title}, Link: ${anime.link}`);
  
  const iframeUrl = anime.link.startsWith('//') ? `https:${anime.link}` : anime.link;
  // Let's modify the iframe link to have some specific episode, say episode 2
  const urlObj = new URL(iframeUrl);
  urlObj.searchParams.set('episode', '2');
  const targetIframeUrl = urlObj.toString();
  
  console.log(`Fetching iframe HTML: ${targetIframeUrl}`);
  
  const res = await fetch(targetIframeUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Referer': 'https://shikimori.one/'
    }
  });
  
  const html = await res.text();
  console.log(`HTML loaded, length: ${html.length}`);
  
  // Search for skip buttons in HTML
  const skipMatches = html.match(/skip_buttons[^\n]+/gi);
  console.log("Skip buttons matches:", skipMatches);
  
  // Search for any other variables containing 'skip' or timings
  const generalSkipMatches = html.match(/\b[a-z_]*skip[a-z_0-9]*\b\s*:/gi);
  console.log("General skip keys:", generalSkipMatches);

  // Let's also look/dump lines containing "skip"
  const lines = html.split('\n');
  const skipLines = lines.filter(l => l.toLowerCase().includes('skip'));
  console.log("Lines containing 'skip':", skipLines.slice(0, 10));
}

run();
