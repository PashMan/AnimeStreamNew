import https from 'https';

const check = async () => {
    https.get('https://api.remanga.org/api/titles/isekai-ten/', {
        headers: {
            'User-Agent': 'Mozilla/5.0'
        }
    }, (res) => {
        let text = '';
        res.on('data', chunk => text+=chunk);
        res.on('end', () => console.log(res.statusCode, text.substring(0, 500)));
    });
}
check();
