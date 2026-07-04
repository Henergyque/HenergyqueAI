module.exports = async function handler(req, res) {
  const url = process.env.QWEN_API_URL;
  let modalStatus = 'non testé';
  let modalError = null;
  let elapsed = 0;

  if (url) {
    const start = Date.now();
    try {
      const r = await fetch(url + '/health', { signal: AbortSignal.timeout(8000) });
      elapsed = Date.now() - start;
      modalStatus = 'HTTP ' + r.status;
    } catch (e) {
      elapsed = Date.now() - start;
      modalError = e.message;
      modalStatus = 'ERREUR';
    }
  }

  res.status(200).json({
    QWEN_API_URL: url || 'NON DÉFINI',
    modalStatus,
    modalError,
    elapsedMs: elapsed,
    node: process.version,
  });
};
