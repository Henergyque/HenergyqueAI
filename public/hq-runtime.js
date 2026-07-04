/* HenergyqueAI Runtime — charge Supabase et shime window.claude
   Remplacer les 3 constantes ci-dessous par tes vraies valeurs.
   Ce fichier est public : mettre uniquement les clés PUBLIQUES (anon + publishable). */

(function () {
  /* ── 1. Constantes publiques (safe côté client) ────────────────────── */
  const SUPABASE_URL       = 'https://pkuafnwnzqummpfapdrs.supabase.co';
  const SUPABASE_ANON      = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrdWFmbnduenF1bW1wZmFwZHJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNTQ1MDEsImV4cCI6MjA5ODczMDUwMX0.CyJBuZ_thf2AUUBt9UZQLXpOOPuwmkSeCPO6gBc5-GY';
  const STRIPE_PUB_KEY     = 'pk_live_51TpSGKAx2JiARlhYZQn1TGuPdOaS3nG2PaQUXksiuafwj6sOhwkTqNcfhaZWyxh9QRGB1QMZPicAv4kDRq4aE3XP00ZB2YaTXW';

  function loadScript(src, onload) {
    const s = document.createElement('script');
    s.src = src;
    s.onload = onload;
    document.head.appendChild(s);
  }

  /* ── 2. Shim window.claude.complete() — défini immédiatement ──────── */
  window.claude = {
    complete: async function (opts) {
      const { system, messages, max_tokens } = opts;

      let token = null;
      try {
        if (window.supabaseClient) {
          const { data } = await window.supabaseClient.auth.getSession();
          token = data?.session?.access_token ?? null;
        }
      } catch (_) {}

      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ system, messages, max_tokens: max_tokens || 1200 }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || 'Erreur serveur');
      }

      const data = await res.json();
      return data.content;
    },
  };

  /* Pré-chauffer Modal immédiatement */
  fetch('/api/warmup').catch(() => {});

  /* ── 3. Charger Stripe.js + SDK Supabase depuis CDN ───────────────── */
  loadScript('https://js.stripe.com/v3/', function () {
    window._stripeInstance = window.Stripe(STRIPE_PUB_KEY);
  });

  loadScript(
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
    function () {
      window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

      /* ── 3. Exposer des helpers auth utilisés dans les pages ─────── */
      window.hqAuth = {
        async inscrire(email, password, name) {
          const { data, error } = await window.supabaseClient.auth.signUp({ email, password });
          if (error) throw error;
          /* Créer le profil dans la table profiles */
          if (data.user) {
            const apiKey = 'hq_live_' + Array.from(crypto.getRandomValues(new Uint8Array(12)))
              .map(b => b.toString(16).padStart(2, '0')).join('');
            await window.supabaseClient.from('profiles').insert({
              id: data.user.id,
              name: name || email.split('@')[0],
              plan: 'gratuit',
              api_key: apiKey,
            });
          }
          return data;
        },

        async connecter(email, password) {
          const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
          if (error) throw error;
          return data;
        },

        async deconnecter() {
          await window.supabaseClient.auth.signOut();
        },

        async getSession() {
          const { data } = await window.supabaseClient.auth.getSession();
          return data?.session ?? null;
        },

        async getProfil() {
          const session = await this.getSession();
          if (!session) return null;
          const { data } = await window.supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();
          return data;
        },

        async getUsageJour() {
          const session = await this.getSession();
          if (!session) return 0;
          const today = new Date().toISOString().slice(0, 10);
          const { data } = await window.supabaseClient
            .from('usage')
            .select('count')
            .eq('user_id', session.user.id)
            .eq('date', today)
            .single();
          return data?.count ?? 0;
        },

        async ouvrirCheckoutStripe() {
          const session = await this.getSession();
          const headers = { 'Content-Type': 'application/json' };
          if (session) headers['Authorization'] = 'Bearer ' + session.access_token;
          const res = await fetch('/api/stripe/checkout', { method: 'POST', headers });
          if (!res.ok) throw new Error(await res.text());
          const { url } = await res.json();
          window.location.href = url;
        },

        async creerSubscription() {
          const session = await this.getSession();
          if (!session) throw new Error('Connexion requise.');
          const res = await fetch('/api/stripe/create-subscription', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + session.access_token,
            },
          });
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(d.error || 'Erreur serveur.');
          }
          return res.json(); // { clientSecret, subscriptionId }
        },
      };

      /* ── 4. Émettre un événement pour signaler que le runtime est prêt */
      document.dispatchEvent(new Event('hq-runtime-ready'));
    }
  );
})();
