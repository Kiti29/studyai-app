require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Page routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/assignments', (req, res) => res.sendFile(path.join(__dirname, 'assignments.html')));
app.get('/tutor', (req, res) => res.sendFile(path.join(__dirname, 'tutor.html')));
app.get('/planner.html', (req, res) => res.sendFile(path.join(__dirname, 'planner.html')));
app.get('/grades.html', (req, res) => res.sendFile(path.join(__dirname, 'grades.html')));
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.post('/chat', async (req, res) => {
  const { messages } = req.body;
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: `You are StudyAI, a smart and friendly AI study coach for Cain, a university student at Western Sydney University. 
      You know Cain personally. He has these assignments due:
      - Accounting Essay Draft (ACC101) — due this Friday, 2000 words, barely started
      - History Quiz (HIST201) — due Thursday, needs to revise chapters 6-7
      - Research Methods Reading (RES101) — due tonight
      His current GPA is 6.8, up from 6.4. He has been studying 7 days straight.
      Be conversational, encouraging, and specific to his situation. Keep responses concise — 2-4 sentences max.`,
      messages: messages
    });
    res.json({ reply: response.content[0].text });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

if (require.main === module) {
  app.listen(3001, () => console.log('StudyAI server running on http://localhost:3001'));
}
module.exports = app;