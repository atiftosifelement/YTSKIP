const { YoutubeTranscript } = require('youtube-transcript-api');

function groupIntoScenes(transcript, maxGapSeconds = 2.0) {
    if (!transcript.length) return [];
    const scenes = [];
    let currentScene = {
        start: transcript[0].offset / 1000,
        end: (transcript[0].offset + transcript[0].duration) / 1000,
        entries: [transcript[0]]
    };
    for (let i = 1; i < transcript.length; i++) {
        const prev = transcript[i-1];
        const curr = transcript[i];
        const prevEnd = (prev.offset + prev.duration) / 1000;
        const currStart = curr.offset / 1000;
        const gap = currStart - prevEnd;
        if (gap > maxGapSeconds) {
            scenes.push(currentScene);
            currentScene = {
                start: currStart,
                end: currStart + curr.duration,
                entries: [curr]
            };
        } else {
            currentScene.end = currStart + curr.duration;
            currentScene.entries.push(curr);
        }
    }
    if (currentScene.entries.length) scenes.push(currentScene);
    return scenes;
}

function isBadLine(text, badWords) {
    const lower = text.toLowerCase();
    return badWords.some(word => lower.includes(word));
}

function extractVideoId(url) {
    const match = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})(?:[&?]|$)/);
    return match ? match[1] : null;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { url, filters = {} } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const videoId = extractVideoId(url);
    if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL' });

    let badWords = [];
    if (filters.filterProfanity) {
        badWords.push('bloody', 'bastard', 'damn', 'hell', 'fuck', 'shit', 'ass', 'bitch', 'whore', 'slut');
    }
    if (filters.filterViolenceWords) {
        badWords.push('kill', 'murder', 'rape', 'attack', 'slaughter', 'stab');
    }
    if (filters.customWords && typeof filters.customWords === 'string') {
        const custom = filters.customWords.split(',').map(w => w.trim().toLowerCase()).filter(w => w.length);
        badWords.push(...custom);
    }
    badWords = [...new Set(badWords)];

    try {
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);
        if (!transcript || transcript.length === 0) {
            return res.json({ skipIntervals: [], error: 'No English subtitles found' });
        }
        const sceneGap = filters.sceneGapSeconds || 2.0;
        const scenes = groupIntoScenes(transcript, sceneGap);
        const badScenes = [];
        for (const scene of scenes) {
            const sceneHasBad = scene.entries.some(entry => isBadLine(entry.text, badWords));
            if (sceneHasBad) {
                badScenes.push({ start: scene.start, end: scene.end });
            }
        }
        badScenes.sort((a,b) => a.start - b.start);
        const merged = [];
        for (const seg of badScenes) {
            if (merged.length === 0 || seg.start > merged[merged.length-1].end) {
                merged.push(seg);
            } else {
                merged[merged.length-1].end = Math.max(merged[merged.length-1].end, seg.end);
            }
        }
        res.json({ skipIntervals: merged });
    } catch (err) {
        console.error(err);
        res.json({ skipIntervals: [], error: 'Failed to fetch subtitles. Video may have no captions.' });
    }
};