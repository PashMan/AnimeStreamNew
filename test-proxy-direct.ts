import fetch from 'node-fetch';

async function testProxy() {
  const baseIframe = 'https://kodikplayer.com/serial/46493/4ed9fe6fe5e02c34794e5a5c69d0c7bc/720p';
  const queryUrl = `http://localhost:3000/api/media/playlist?url=${encodeURIComponent(baseIframe)}&episode=2`;
  
  console.log(`1. Fetching master playlist: ${queryUrl}`);
  try {
    const res = await fetch(queryUrl);
    console.log(`   Status: ${res.status}`);
    const text = await res.text();
    console.log(`   Body starts with:\n`, text.slice(0, 400));
    console.log(`   ...\n`);

    // Extract first playlist/quality url or segment proxied line
    const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    if (lines.length === 0) {
      console.log("   No lines found in playlist.");
      return;
    }

    const firstSubUrl = lines[0].startsWith('http') ? lines[0] : `http://localhost:3000${lines[0]}`;
    console.log(`2. Fetching sub-playlist/quality manifest: ${firstSubUrl}`);
    const res2 = await fetch(firstSubUrl);
    console.log(`   Status: ${res2.status}`);
    const text2 = await res2.text();
    console.log(`   Body length: ${text2.length}`);
    console.log(`   Body starts with:\n`, text2.slice(0, 500));

    const segmentLines = text2.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    if (segmentLines.length === 0) {
      console.log("   No segment URLs found in sub-playlist.");
      return;
    }

    const firstSegment = segmentLines[0].startsWith('http') ? segmentLines[0] : `http://localhost:3000${segmentLines[0]}`;
    console.log(`3. Fetching single segment proxy URL: ${firstSegment}`);
    const res3 = await fetch(firstSegment);
    console.log(`   Status: ${res3.status}`);
    console.log(`   Content-Type: ${res3.headers.get('content-type')}`);
    console.log(`   Content-Length: ${res3.headers.get('content-length')}`);
    
  } catch (err: any) {
    console.log(`Error during check: ${err.message}`);
  }
}

testProxy();
