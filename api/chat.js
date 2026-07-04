// api/chat.js — Vercel Serverless Function
// Proxie les requêtes vers le serveur Qwen (Modal) après vérification auth + limites d'usage

const { createClient } = require('@supabase/supabase-js');

const LIMITE_GRATUIT = 20; // requêtes par jour pour le plan gratuit

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  /* ── Auth ────────────────────────────────────────────────────────── */
  const authHeader = req.headers['authorization'] ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let userId = null;
  let plan = 'gratuit';

  if (token) {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (!error && user) {
      userId = user.id;
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('plan')
        .eq('id', userId)
        .single();
      plan = profile?.plan ?? 'gratuit';
    }
  }

  /* ── Vérification quota (plan gratuit uniquement) ─────────────────── */
  if (plan === 'gratuit') {
    const today = new Date().toISOString().slice(0, 10);

    if (userId) {
      const { data: usageRow } = await supabaseAdmin
        .from('usage')
        .select('count')
        .eq('user_id', userId)
        .eq('date', today)
        .single();

      const count = usageRow?.count ?? 0;
      if (count >= LIMITE_GRATUIT) {
        return res.status(429).json({
          error: `Limite atteinte — le plan Gratuit permet ${LIMITE_GRATUIT} requêtes par jour. Passez en Pro pour une utilisation illimitée.`,
        });
      }
    }
    /* Utilisateur non connecté : on autorise jusqu'à 3 messages de démo (sans persistance) */
  }

  /* ── Requête vers le modèle Qwen ──────────────────────────────────── */
  const { system, messages, max_tokens } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Paramètre messages manquant ou invalide.' });
  }

  const qwenMessages = system
    ? [{ role: 'system', content: system }, ...messages]
    : messages;

  let qwenResp;
  try {
    qwenResp = await fetch(process.env.QWEN_API_URL + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen2.5-coder-7b',
        messages: qwenMessages,
        max_tokens: max_tokens || 600,
        temperature: 0.3,
        stream: false,
        stop: ['\nuser:', '\nUser:', '\nassistant:', '\nAssistant:', '# README', '<|im_end|>', '<|endoftext|>'],
      }),
    });
  } catch (err) {
    console.error('Erreur connexion Qwen:', err);
    return res.status(502).json({ error: 'Serveur IA indisponible. Réessayez dans quelques instants.' });
  }

  if (!qwenResp.ok) {
    const body = await qwenResp.text();
    console.error('Réponse Qwen erreur:', body);
    return res.status(502).json({ error: 'Erreur du serveur IA.' });
  }

  const qwenData = await qwenResp.json();
  let content = qwenData.choices?.[0]?.message?.content ?? '';

  /* Couper dès que le modèle commence à halluciner du README ou des fausses conversations */
  const cutPatterns = [
    /\n\.?\/?README/i,
    /\n#\s*HenergyqueAI/i,
    /\n##\s*Fonctionnali/i,
    /\nuser\s*:/i,
    /\nassistant\s*:/i,
    /\n##\s*Exemple/i,
  ];
  for (const p of cutPatterns) {
    const m = content.search(p);
    if (m !== -1) content = content.slice(0, m).trimEnd();
  }

  /* ── Incrémenter le compteur d'usage ──────────────────────────────── */
  if (userId) {
    const today = new Date().toISOString().slice(0, 10);
    await supabaseAdmin.rpc('increment_usage', { p_user_id: userId, p_date: today });
  }

  return res.status(200).json({ content });
};
