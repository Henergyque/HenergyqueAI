module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    await fetch(process.env.QWEN_API_URL + '/health', { method: 'GET', signal: AbortSignal.timeout(8000) });
  } catch (_) {}
  res.status(200).json({ ok: true });
};
