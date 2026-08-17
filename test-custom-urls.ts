async function testCustomUrls() {
  const urls = [
    "https://cdn.kamianime.club/kimi-no-na-wa/master.m3u8",
    "https://cdn1.kamianime.club/suzume/master.m3u8",
    "https://cdn1.kamianime.club/weathering/master.m3u8",
    "https://cdn1.kamianime.club/garden_of_words/master.m3u8"
  ];
  
  for (const url of urls) {
    try {
      console.log(`Fetching: ${url}`);
      const res = await fetch(url);
      console.log(`Status: ${res.status}`);
      if (res.ok) {
        const text = await res.text();
        console.log(`Lines: ${text.split('\n').slice(0, 5).join(' | ')}`);
      }
    } catch (e: any) {
      console.log(`Error on ${url}:`, e.message);
    }
  }
}

testCustomUrls();
