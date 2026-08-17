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
  'kodikapi.ru',
  'kodikapi.com'
];

async function checkDomains() {
  for (const domain of domains) {
    try {
      console.log(`Checking https://${domain}...`);
      const res = await fetch(`https://${domain}`, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
      console.log(`  Success! Status: ${res.status}`);
    } catch (e: any) {
      console.log(`  Failed: ${e.message}`);
    }
  }
}

checkDomains();
