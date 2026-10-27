require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// Pages
const PAGES = ['index', 'dashboard', 'assignments', 'tutor', 'planner', 'grades', 'login'];
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
PAGES.forEach(p =>
  app.get(`/${p}.html`, (req, res) => res.sendFile(path.join(__dirname, `${p}.html`)))
);
app.get('/shared.js', (req, res) => res.sendFile(path.join(__dirname, 'shared.js')));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function supabaseFor(token) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
}

function buildSystemPrompt(name, d) {
  const today = new Date().toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Australia/Sydney',
  });

  const tasks = (d.tasks || []).filter(t => !t.done)
    .map(t => `- ${t.name} (${t.sub}), ${t.due}`).join('\n') || 'None logged';

  const grades = Object.entries(d.grades || {}).map(([code, items]) => {
    const w = items.reduce((s, i) => s + i.weight, 0);
    const avg = w ? (items.reduce((s, i) => s + i.grade * i.weight, 0) / w).toFixed(1) : 'n/a';
    return `- ${code}: ${avg}% weighted average (${items.map(i => `${i.name} ${i.grade}%`).join(', ')})`;
  }).join('\n') || 'None logged';

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const sessions = Object.entries(d.sessions || {}).map(([k, s]) =>
    `- ${days[parseInt(k.split('-')[0], 10)]}: ${s.subject}, ${s.duration}h${s.note ? ' (' + s.note + ')' : ''}`
  ).join('\n') || 'None scheduled';

  return `You are StudyAI, a friendly, direct AI study coach for ${name}, a university student.
Today is ${today}.

Use ONLY the data below about ${name}. If something isn't listed, say you don't have it and ask. Never invent deadlines, grades or classes.

PENDING TASKS:
${tasks}

GRADES:
${grades}

STUDY SESSIONS PLANNED THIS WEEK:
${sessions}

Keep replies to 2-4 sentences unless asked for more. Be specific to their data.`;
}

app.post('/chat', async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not logged in' });

  const messages = (Array.isArray(req.body.messages) ? req.body.messages : [])
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-20)
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (!messages.length) return res.status(400).json({ error: 'No messages' });

  try {
    const sb = supabaseFor(token);
    const { data: { user }, error } = await sb.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Session expired' });

    const { data: row } = await sb.from('user_data').select('*').eq('user_id', user.id).maybeSingle();
    const name = (user.user_metadata && user.user_metadata.name) || user.email.split('@')[0];

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: buildSystemPrompt(name, row || {}),
      messages,
    });
    res.json({ reply: response.content[0].text });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

if (require.main === module) {
  app.listen(3001, () => console.log('StudyAI server running on http://localhost:3001'));
}
module.exports = app;