// api/proxy.js
export default async function handler(req, res) {
  // Enable CORS for your frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { video_url, url } = req.body;
  const videoUrl = video_url || url;
  if (!videoUrl) {
    return res.status(400).json({ error: 'Missing video URL' });
  }
  
  // Forward the request to your Replit app
  const replitUrl = 'https://asset-manager--atiftosif.replit.app/transcript';
  
  try {
    const response = await fetch(replitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_url: videoUrl })
    });
    
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}