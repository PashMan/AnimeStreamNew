import dns from 'dns';

async function testCorsProxy() {
  const targetUrl = '/search?token=b3b563060d02ee000ca18740b7842ca0&shikimori_id=21';
  
  const domains = [
    'kodik.cc',
    'kodik.info',
    'kodik.biz',
    'kodik.net',
    'kodik.tv',
    'kodik.ru',
    'kodikapi.com',
    'kodikapi.cc',
    'kodikapi.info',
    'kodikapi.biz',
    'kodikapi.net',
    'kodikapi.tv',
    'kodikapi.ru'
  ];

  for (const domain of domains) {
    try {
      console.log(`Testing https://${domain}${targetUrl}...`);
      const res = await fetch(`https://${domain}${targetUrl}`);
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
