const express = require('express');
const path = require('path');
const app = express();

// Webhook Stripe : body brut (pas parsé)
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.all('/api/stripe/webhook', require('./api/stripe/webhook'));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.all('/api/chat',                   require('./api/chat'));
app.all('/api/contact',                require('./api/contact'));
app.all('/api/warmup',                 require('./api/warmup'));
app.all('/api/debug',                  require('./api/debug'));
app.all('/api/stripe/checkout',        require('./api/stripe/checkout'));
app.all('/api/stripe/create-subscription', require('./api/stripe/create-subscription'));

// Clean URL rewrites
const pages = ['chat','compte','tarifs','blog','contact','documentation','statut','cgu','confidentialite'];
pages.forEach(p => {
  app.get('/' + p, (req, res) => res.sendFile(path.join(__dirname, 'public', p + '.html')));
});
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('HenergyqueAI running on port', PORT));
