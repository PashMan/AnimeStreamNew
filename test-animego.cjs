const fetch = require('node-fetch');

async function testSearch(title) {
  const domains = ['animego.me', 'animego.org'];
  for (const domain of domains) {
    const url = `https://${domain}/search/anime?q=${encodeURIComponent(title)}`;
    console.log(`Fetching: ${url}`);
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3'
        }
      });
      console.log(`Status: ${res.status}`);
      const text = await res.text();
      console.log(`Length of HTML: ${text.length}`);
      if (text.includes('animego')) {
        console.log(`Contains "animego" word: Yes`);
      }
      // Check if it has the title or search results
      console.log(`Snippet: ${text.substring(0, 1000)}`);
      
      const regex = /href="(?:\/|https?:\/\/[^\/]+\/)anime\/([a-z0-9-]+-([0-9]+))"/gi;
      let match;
      const candidates = [];
      while ((match = regex.exec(text)) !== null) {
        candidates.push({ path: match[1], id: match[2] });
      }
      console.log(`Candidates found (${candidates.length}):`, candidates.slice(0, 5));
    } catch (err) {
      console.error(`Error for ${domain}:`, err);
    }
  }
}

testSearch('Grand Blue');
