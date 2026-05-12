// api/getSubtitles.js
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
  
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL required' });
  }
  
  // Extract video ID
  const videoId = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})(?:[&?]|$)/)?.[1];
  if (!videoId) {
    return res.status(400).json({ error: 'Invalid YouTube URL' });
  }
  
  try {
    // Fetch the YouTube video page
    const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    const html = await response.text();
    
    // Extract ytInitialPlayerResponse JSON
    const regex = /var ytInitialPlayerResponse = ({.*?});/;
    const match = html.match(regex);
    if (!match) {
      return res.status(404).json({ error: 'Could not find player response' });
    }
    
    const playerResponse = JSON.parse(match[1]);
    const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    
    if (!captions || captions.length === 0) {
      return res.status(404).json({ error: 'No subtitles available for this video' });
    }
    
    // Prefer English, otherwise pick first available
    let selectedTrack = captions.find(track => track.languageCode === 'en');
    if (!selectedTrack) {
      selectedTrack = captions[0];
    }
    
    // Fetch the actual subtitle file (XML/WebVTT)
    const subUrl = selectedTrack.baseUrl;
    const subResponse = await fetch(subUrl);
    const subText = await subResponse.text();
    
    // Parse subtitles into array of {start, end, text}
    const entries = [];
    let lines = subText.split('\n');
    
    // Handle XML format (common)
    if (subText.includes('<text')) {
      const xmlRegex = /<text start="([\d.]+)" dur="([\d.]+)">(.*?)<\/text>/gs;
      let match;
      while ((match = xmlRegex.exec(subText)) !== null) {
        const start = parseFloat(match[1]);
        const duration = parseFloat(match[2]);
        const text = match[3].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
        entries.push({
          start: start,
          end: start + duration,
          text: text.trim()
        });
      }
    } 
    // Handle WebVTT
    else {
      let current = null;
      for (let line of lines) {
        line = line.trim();
        if (line.includes('-->')) {
          const times = line.split('-->');
          const start = parseTime(times[0].trim());
          const end = parseTime(times[1].trim());
          current = { start, end, text: '' };
        } else if (current && line && !line.match(/^\d+$/) && !line.includes('WEBVTT')) {
          current.text += (current.text ? ' ' : '') + line;
        } else if (current && line === '') {
          if (current.text) entries.push(current);
          current = null;
        }
      }
      if (current && current.text) entries.push(current);
    }
    
    return res.status(200).json({ entries });
    
  } catch (err) {
    console.error('Subtitle fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch subtitles: ' + err.message });
  }
}

function parseTime(timeStr) {
  let hours = 0, minutes = 0, seconds = 0;
  const parts = timeStr.split(':');
  if (parts.length === 3) {
    hours = parseFloat(parts[0]);
    minutes = parseFloat(parts[1]);
    seconds = parseFloat(parts[2]);
  } else if (parts.length === 2) {
    minutes = parseFloat(parts[0]);
    seconds = parseFloat(parts[1]);
  } else {
    seconds = parseFloat(parts[0]);
  }
  return hours * 3600 + minutes * 60 + seconds;
}