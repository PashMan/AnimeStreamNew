import http from 'http';
import https from 'https';

const get = () => {
    https.get('https://uploads.mangadex.org/covers/32d76d19-8a05-4db0-9fc2-e0b0648fdc4b/ed156475-a864-44ac-9fb0-f140de29a321.jpg', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Referer': 'https://mangadex.org/'
        }
    }, (res) => {
        console.log(res.statusCode);
        console.log(res.headers);
    });
};
get();
