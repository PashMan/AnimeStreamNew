async function checkKodikRu() {
  const token = "17cc4ee691bc251131a9041e6e89e78e";
  const url = `https://kodik.ru/search?token=${token}&shikimori_id=62568`;
  try {
    console.log(`Querying ${url}...`);
    const res = await fetch(url);
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response starts with:", text.slice(0, 500));
  } catch (e: any) {
    console.log("Error:", e.message);
  }
}
checkKodikRu();
