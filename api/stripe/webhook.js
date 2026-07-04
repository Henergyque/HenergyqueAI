// api/stripe/webhook.js — Vercel Serverless Function
// Reçoit les événements Stripe et met à jour le plan dans Supabase

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const rawBody = await readRawBody(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Signature Stripe invalide:', err.message);
    return res.status(400).json({ error: 'Signature invalide.' });
  }

  const sub = event.data.object;

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const userId = sub.metadata?.supabase_user_id;
      if (!userId) {
        /* Fallback : retrouver via stripe_customer_id */
        const customerId = sub.customer;
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();
        if (profile) {
          await supabaseAdmin
            .from('profiles')
            .update({ plan: sub.status === 'active' ? 'pro' : 'gratuit', stripe_subscription_id: sub.id })
            .eq('id', profile.id);
        }
      } else {
        await supabaseAdmin
          .from('profiles')
          .update({ plan: sub.status === 'active' ? 'pro' : 'gratuit', stripe_subscription_id: sub.id })
          .eq('id', userId);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const customerId = sub.customer;
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .single();
      if (profile) {
        await supabaseAdmin
          .from('profiles')
          .update({ plan: 'gratuit', stripe_subscription_id: null })
          .eq('id', profile.id);
      }
      break;
    }

    default:
      break;
  }

  return res.status(200).json({ received: true });
};
