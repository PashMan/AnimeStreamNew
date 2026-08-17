import dns from 'dns';

async function testCorsProxy() {
  const targetUrl = 'https://kodikapi.com/search?token=b3b563060d02ee000ca18740b7842ca0&shikimori_id=21';
  
  const proxies = [
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
    `https://thingproxy.freeboard.io/fetch/${targetUrl}`
  ];

  for (const proxy of proxies) {
    try {
      console.log(`Testing ${proxy}...`);
      const res = await fetch(proxy);
      console.log(`Status: ${res.status}`);
      if (res.ok) {
        const data = await res.json();
        console.log(`Success! Results: ${data.results?.length}`);
      } else {
        console.log(`Failed: ${await res.text()}`);
      }
    } catch (e) {
      console.error(`Error:`, e.message);
    }
  }
}

testCorsProxy();
