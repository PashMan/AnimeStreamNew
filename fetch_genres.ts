import https from 'https';

https.get('https://shikimori.one/api/genres', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const genres = JSON.parse(data);
    const adult = genres.filter((g: any) => g.name && g.name.includes('Adult'));
    console.log(adult);
  });
});
