const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { vote, question, reponse } = req.body ?? {};
  if (!vote || !['positif', 'negatif'].includes(vote)) {
    return res.status(400).json({ error: 'vote invalide' });
  }

  const authHeader = req.headers['authorization'] ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let userId = null;
  if (token) {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (user) userId = user.id;
  }

  const { error } = await supabaseAdmin.from('feedback').insert({
    user_id: userId,
    vote,
    question: (question ?? '').slice(0, 2000),
    reponse: (reponse ?? '').slice(0, 4000),
  });

  if (error) {
    console.error('Erreur feedback:', error.message);
    return res.status(500).json({ error: 'Erreur serveur' });
  }

  return res.status(200).json({ ok: true });
};
