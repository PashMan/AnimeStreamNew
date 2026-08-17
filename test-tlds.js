import dns from 'dns';

async function testDomains() {
  const tlds = ['pw', 'su', 'top', 'online', 'site', 'space', 'club', 'pro', 'me', 'io', 'co', 'ws', 'to', 'is', 'vc'];
  const resolver = new dns.Resolver();
  resolver.setServers(['8.8.8.8']);

  for (const tld of tlds) {
    const domain = `kodikapi.${tld}`;
    resolver.resolve(domain, (err, addresses) => {
      if (!err) console.log(`Found: ${domain} -> ${addresses}`);
    });
    const domain2 = `kodik.${tld}`;
    resolver.resolve(domain2, (err, addresses) => {
      if (!err) console.log(`Found: ${domain2} -> ${addresses}`);
    });
  }
}

testDomains();
