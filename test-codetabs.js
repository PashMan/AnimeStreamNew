import { fetch } from 'undici';
async function test() {
   const url = 'https://api.remanga.org/api/search/catalog/?count=5&offset=0';
   const reqUrl = 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(url);
   const res = await fetch(reqUrl);
   console.log("Status:", res.status);
   let data = await res.text();
   console.log(data);
}
test();
