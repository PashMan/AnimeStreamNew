import { fetch, ProxyAgent } from 'undici';

async function test() {
    try {
        // Fetch a free proxy list (Russian or Ukrainian proxies or just general)
        let proxyRes = await fetch('https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt');
        let proxyText = await proxyRes.text();
        let proxies = proxyText.split('\n').filter(p => p.trim());
        
        console.log(`Found ${proxies.length} proxies`);
        
        // Let's test the first 20
        for (let i = 0; i < 20; i++) {
            let proxyUrl = `http://${proxies[Math.floor(Math.random() * proxies.length)].trim()}`;
            console.log(`Testing proxy: ${proxyUrl}`);
            try {
                const agent = new ProxyAgent(proxyUrl);
                const res = await fetch('https://api.remanga.org/api/titles/isekai-ten/', {
                    dispatcher: agent,
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    signal: AbortSignal.timeout(3000)
                });
                console.log(`[${proxyUrl}] Status:`, res.status);
                if (res.status === 200) {
                    console.log('SUCCESS!!!!!', await res.text().then(t => t.substring(0, 100)));
                    break;
                }
            } catch (e) {
                console.log(`[${proxyUrl}] Failed:`, e.message);
            }
        }
    } catch (e) {
        console.error("Master try-catch", e)
    }
}
test();
