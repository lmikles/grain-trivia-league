/**
 * api/trivia.js
 * AI-powered trivia question generator using the Anthropic API.
 *
 * POST /api/trivia
 * Body (JSON): {
 *   topic:      string  — e.g. "Delaware history", "80s music", "sports"
 *   difficulty: string  — "easy" | "medium" | "hard"  (default: "medium")
 *   count:      number  — how many questions to generate  (default: 5, max: 20)
 * }
 *
 * Returns:
 * {
 *   questions: [{
 *     question: string,
 *     answer:   string,
 *     options:  string[]   // 4 multiple-choice options; correct one included
 *   }]
 * }
 *
 * Required env var: ANTHROPIC_API_KEY
 */

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { topic = 'general knowledge', difficulty = 'medium', count = 5 } = req.body || {};

  const questionCount = Math.min(Math.max(1, Number(count)), 20);

  const prompt = `Generate ${questionCount} trivia questions suitable for a bar trivia night.
Topic: ${topic}
Difficulty: ${difficulty}

Rules:
- Questions should be fun, engaging, and appropriate for adults at a restaurant/bar.
- Each question must have exactly 4 multiple-choice options.
- Exactly one option must be correct; the other three should be plausible but wrong.
- Vary question types (facts, "which of these", "who was the first to...", etc.).
- For ${difficulty} difficulty: ${{
    easy: 'questions should be common knowledge most people would know',
    medium: 'questions should require some specific knowledge but not be obscure',
    hard: 'questions should be challenging and require detailed knowledge',
  }[difficulty] || 'moderate challenge level'}.

Return ONLY a valid JSON array with no additional text or markdown. Format:
[
  {
    "question": "Question text here?",
    "answer": "Correct answer text",
    "options": ["Option A", "Option B", "Option C", "Option D"]
  }
]
The correct answer must be one of the four options (exact match).`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[trivia] Anthropic API error:', response.status, errBody);
      return res.status(502).json({ error: 'Question generation failed', details: `API returned ${response.status}` });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    // Strip any accidental markdown fences before parsing
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const questions = JSON.parse(cleaned);

    if (!Array.isArray(questions)) {
      throw new Error('Response was not a JSON array');
    }

    return res.status(200).json({ questions });
  } catch (err) {
    console.error('[trivia] error:', err.message);
    return res.status(500).json({ error: 'Failed to generate questions', details: err.message });
  }
};
