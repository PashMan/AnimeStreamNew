async function checkCors() {
  const url = "https://cdn.kamianime.club/kimi-no-na-wa/master.m3u8";
  try {
    const res = await fetch(url, { method: 'HEAD' });
    console.log("Status:", res.status);
    console.log("Headers:");
    res.headers.forEach((val, key) => {
      console.log(`  ${key}: ${val}`);
    });
  } catch (e: any) {
    console.log("Error:", e.message);
  }
}
checkCors();
