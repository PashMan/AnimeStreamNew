async function testRegexBug() {
  const url = "https://im.manga-chan.me/online/1117878-solo_leveling_ragnarok_v1_ch_1.html";
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const text = await res.text();
  
  console.log("=== Testing extraction ===");
  // Look for full_images or images script variable
  const fullImagesMatch = text.match(/full_images\s*=\s*(\[[^\]]+\])/i) || text.match(/images\s*=\s*(\[[^\]]+\])/i);
  if (fullImagesMatch) {
    try {
      const arr = JSON.parse(fullImagesMatch[1]);
      console.log("Found via full_images/images var! Count:", arr.length, "Sample:", arr[0]);
    } catch(e) {
      console.log("Parse err:", e.message);
    }
  }

  // Also test array regex
  const arrayMatches = text.match(/\[\s*["']https?:\/\/[^\]]+\]/g) || [];
  console.log("Array matches count:", arrayMatches.length);
  for (const m of arrayMatches) {
    try {
      const arr = JSON.parse(m);
      console.log("Array match parse SUCCESS! count:", arr.length, "Sample:", arr[0]);
    } catch(e) {
      console.log("Array match parse err:", e.message);
    }
  }
}
testRegexBug();
