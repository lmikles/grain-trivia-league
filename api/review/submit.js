/**
 * api/review/submit.js
 * Final submission of approved content topics.
 *
 * POST /api/review/submit
 * Body: { approvedTopics: [{ id, platform, proposedDate, proposedTime, topic, postType, editedText? }] }
 *
 * MVP: logs the submission to console + writes to /tmp/omg-submissions.json.
 * Phase 2: trigger actual AI content generation pipeline.
 *
 * Auth: HOST_SECRET via Authorization: Bearer <secret>
 */

const fs = require('fs');
const { isValidHostSecret } = require('../../lib/auth');

const SUBMISSIONS_FILE = '/tmp/omg-submissions.json';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function loadSubmissions() {
  try {
    return JSON.parse(fs.readFileSync(SUBMISSIONS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!isValidHostSecret(req.headers['authorization'])) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { approvedTopics } = req.body || {};
    if (!Array.isArray(approvedTopics) || approvedTopics.length === 0) {
      return res.status(400).json({ error: 'approvedTopics array is required and must be non-empty' });
    }

    const submission = {
      submittedAt: new Date().toISOString(),
      topicCount: approvedTopics.length,
      topics: approvedTopics,
    };

    // Persist to /tmp for inspection (ephemeral — Phase 2 will send to real pipeline)
    const history = loadSubmissions();
    history.push(submission);
    fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(history, null, 2), 'utf8');

    console.log(`[review/submit] Board submitted ${approvedTopics.length} approved topic(s) at ${submission.submittedAt}`);
    approvedTopics.forEach((t, i) => {
      console.log(`  [${i + 1}] ${t.platform} | ${t.proposedDate} ${t.proposedTime} | ${t.postType} | ${(t.editedText || t.topic).slice(0, 80)}`);
    });

    return res.status(200).json({
      ok: true,
      submittedAt: submission.submittedAt,
      topicCount: approvedTopics.length,
      message: 'Content schedule submitted. Generation pipeline is Phase 2.',
    });
  } catch (err) {
    console.error('[review/submit] error:', err.message);
    return res.status(500).json({ error: 'Submit failed', details: err.message });
  }
};
