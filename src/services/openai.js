// Groq direct fetch using Vite dev proxy to avoid Cloudflare cookie warnings
const MODEL = 'llama-3.3-70b-versatile';

let lastCall = 0;
const COOLDOWN = 1000;

const waitCooldown = async () => {
  const now = Date.now();
  const diff = now - lastCall;
  if (diff < COOLDOWN) {
    await new Promise((r) => setTimeout(r, COOLDOWN - diff));
  }
  lastCall = Date.now();
};

const generate = async (messages, jsonMode = false) => {
  await waitCooldown();
  const body = {
    model: MODEL,
    messages,
    temperature: 0.7,
  };
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  try {
    const res = await fetch('/groq/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`,
      },
      body: JSON.stringify(body),
      credentials: 'omit',
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Groq API error ${res.status}: ${errText}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (err) {
    if (err.status === 429) {
      throw new Error('Groq rate limit reached. Please wait a moment.');
    }
    throw err;
  }
};

// ---------------- FEATURES ----------------

export const generateSummary = async (content) => {
  const prompt = `Summarize the following study notes in simple language with bullet points:\n\n${content.slice(0, 6000)}`;
  
  const messages = [
    { role: 'system', content: 'You are a helpful study assistant. Create concise summaries.' },
    { role: 'user', content: prompt }
  ];

  return await generate(messages);
};

export const generateFlashcards = async (content) => {
  const prompt = `Create 10 flashcards from the following content.
Respond ONLY in JSON format with this structure:
{
  "flashcards": [
    { "question": "Question here", "answer": "Answer here" }
  ]
}

Content:
${content.slice(0, 4000)}`;

  const messages = [
    { role: 'system', content: 'You are a helpful study assistant. output JSON only.' },
    { role: 'user', content: prompt }
  ];

  const text = await generate(messages, true);
  
  try {
    const parsed = JSON.parse(text);
    return parsed.flashcards || parsed;
  } catch (e) {
    // Fallback parsing if JSON mode fails or returns extra text
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return parsed.flashcards || parsed;
    }
    throw new Error('Failed to parse flashcards JSON');
  }
};

export const generateQuiz = async (content) => {
  const prompt = `
Generate 5 Multiple Choice Questions (MCQ) from the content.
Respond ONLY in JSON format with this structure:
{
  "quiz": [
    {
      "question": "Question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0
    }
  ]
}
Note: correctAnswer is the index (0-3) of the correct option.

Content:
${content.slice(0, 4000)}
`;

  const messages = [
    { role: 'system', content: 'You are a helpful study assistant. Output JSON only.' },
    { role: 'user', content: prompt }
  ];

  const text = await generate(messages, true);

  try {
    const parsed = JSON.parse(text);
    return parsed.quiz || parsed;
  } catch (e) {
     const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return parsed.quiz || parsed;
    }
    throw new Error('Failed to parse quiz JSON');
  }
};

export const chatWithTutor = async (messages) => {
  // Convert existing messages to Groq format if needed, though they match {role, content}
  const systemMessage = {
    role: 'system',
    content: 'You are a friendly and knowledgeable AI tutor. Keep answers concise and helpful. Use the context provided by the user to answer questions.'
  };

  const conversation = [systemMessage, ...messages];

  const reply = await generate(conversation);
  return { role: 'assistant', content: reply };
};
