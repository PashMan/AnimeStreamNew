async function test() {
  const url = `https://kodikapi.com/search?token=b3b563060d02ee000ca18740b7842ca0&shikimori_id=20`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      }
    });
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Body:", text);
  } catch(e) {
    console.error(e.message);
  }
}
test();
