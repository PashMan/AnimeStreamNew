async function testEndpoint() {
  try {
    const iframeUrl = "https://kodikplayer.com/serial/46493/4ed9fe6fe5e02c34794e5a5c69d0c7bc/720p?episode=2";
    const res = await fetch(`http://127.0.0.1:3000/api/media/playlist?url=${encodeURIComponent(iframeUrl)}&quality=720`);
    console.log("Response status:", res.status);
    const text = await res.text();
    console.log("Response text start:", text.slice(0, 300));
  } catch (err: any) {
    console.error("Fetch error:", err.message);
  }
}

testEndpoint();
