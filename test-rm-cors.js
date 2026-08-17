import { request } from 'undici';

const check = async () => {
    let res = await request('https://api.remanga.org/api/search/catalog/?count=5&offset=0', {
        method: 'OPTIONS',
        headers: {
            'Origin': 'https://example.com',
            'Access-Control-Request-Method': 'GET'
        }
    });
    console.log(res.statusCode);
    console.log(res.headers);
}
check();
