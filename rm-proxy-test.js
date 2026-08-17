import { fetch } from 'undici';
async function test() {
  const proxies = [
    'https://api.allorigins.win/raw?url=',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://thingproxy.freeboard.io/fetch/'
  ];
  for(let proxy of proxies) {
    try {
      let r = await fetch(proxy + encodeURIComponent('https://api.remanga.org/api/titles/isekai-ten/'));
      console.log(proxy, r.status);
    } catch(e) {
      console.log(proxy, e.message);
    }
  }
}
test();
