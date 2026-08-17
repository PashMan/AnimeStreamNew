async function testCisProxy() {
  const targetUrl = 'https://kodik-api.com/search?token=17cc4ee691bc251131a9041e6e89e78e&shikimori_id=62568';
  
  const cisProxies = [
    `https://cors.bridge.su/${targetUrl}`,
    `https://cors.eu.org/${targetUrl}`
  ];
  
  for (const proxy of cisProxies) {
    try {
      console.log(`Testing: ${proxy}`);
      const res = await fetch(proxy);
      console.log(`Status: ${res.status}`);
      if (res.ok) {
        const text = await res.text();
        console.log(`Content length: ${text.length}`);
        console.log("Starts with:", text.slice(0, 200));
      }
    } catch (e: any) {
      console.log(`Error: ${e.message}`);
    }
  }
}
testCisProxy();
