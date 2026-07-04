// api/contact.js — Vercel Serverless Function
// Reçoit le formulaire de contact et envoie un email via Resend

const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { nom, email, sujet, message } = req.body ?? {};

  if (!nom || !email || !sujet || !message) {
    return res.status(400).json({ error: 'Tous les champs sont obligatoires.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Adresse email invalide.' });
  }

  if (message.length > 4000) {
    return res.status(400).json({ error: 'Message trop long (4000 caractères max).' });
  }

  try {
    await resend.emails.send({
      from: 'Contact HenergyqueAI <noreply@henergyqueai.fr>',
      to: 'henergyqueai@gmail.com',
      replyTo: email,
      subject: `[Contact] ${sujet}`,
      text: `Nom : ${nom}\nEmail : ${email}\nSujet : ${sujet}\n\n${message}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#56c8f5">Nouveau message — HenergyqueAI</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px;font-weight:600;width:100px">Nom</td><td>${nom}</td></tr>
            <tr><td style="padding:8px;font-weight:600">Email</td><td><a href="mailto:${email}">${email}</a></td></tr>
            <tr><td style="padding:8px;font-weight:600">Sujet</td><td>${sujet}</td></tr>
          </table>
          <div style="margin-top:16px;padding:16px;background:#f6f6f6;border-radius:8px;white-space:pre-wrap">${message}</div>
        </div>
      `,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Erreur Resend:', err);
    return res.status(500).json({ error: "Erreur lors de l'envoi. Réessayez." });
  }
};
