async function testDownload() {
  try {
    const iframeUrl = "https://kodikplayer.com/serial/46493/4ed9fe6fe5e02c34794e5a5c69d0c7bc/720p?episode=2";
    console.log("Triggering download start...");
    const startUrl = `http://127.0.0.1:3000/api/media/download/start?url=${encodeURIComponent(iframeUrl)}&quality=720&title=ChainsawMan&episode=2`;
    const startRes = await fetch(startUrl);
    console.log("Start response status:", startRes.status);
    const startData = await startRes.json() as any;
    console.log("Start response:", startData);

    if (!startData.success || !startData.taskId) {
      console.error("Start failed:", startData);
      return;
    }

    const { taskId } = startData;
    console.log(`Polling task ${taskId}...`);

    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const progRes = await fetch(`http://127.0.0.1:3000/api/media/download/progress?taskId=${taskId}`);
      const progData = await progRes.json() as any;
      console.log(`Poll ${i + 1}: status=${progData.status} stage=${progData.stage} progress=${progData.progress}% error=${progData.error}`);
      if (progData.status === 'success' || progData.status === 'failed') {
        break;
      }
    }
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}

testDownload();
