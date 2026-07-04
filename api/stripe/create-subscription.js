// api/stripe/create-subscription.js — Vercel Serverless Function
// Crée un abonnement Stripe avec payment_behavior 'default_incomplete'
// Retourne le clientSecret pour que Stripe Elements confirme le paiement côté client

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const authHeader = req.headers['authorization'] ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Connexion requise.' });

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Session invalide.' });

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('stripe_customer_id, plan, name')
    .eq('id', user.id)
    .single();

  if (profile?.plan === 'pro') {
    return res.status(400).json({ error: 'Vous êtes déjà en plan Pro.' });
  }

  /* ── Créer ou récupérer le customer Stripe ─────────────────────── */
  let customerId = profile?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: profile?.name ?? '',
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await supabaseAdmin
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id);
  }

  /* ── Créer l'abonnement en mode "incomplet" ─────────────────────── */
  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: process.env.STRIPE_PRICE_ID }],
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.payment_intent'],
    metadata: { supabase_user_id: user.id },
  });

  const paymentIntent = subscription.latest_invoice?.payment_intent;
  if (!paymentIntent?.client_secret) {
    return res.status(500).json({ error: 'Impossible de créer l\'intention de paiement.' });
  }

  return res.status(200).json({
    clientSecret: paymentIntent.client_secret,
    subscriptionId: subscription.id,
  });
};
