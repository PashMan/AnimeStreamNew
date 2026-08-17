import https from 'https';

const check = () => {
    https.request('https://api.remanga.org/api/titles/isekai-ten/', { method: 'OPTIONS' }, (res) => {
        console.log("CORS STATUS:", res.statusCode);
        console.log(res.headers);
    }).end();
}
check();
