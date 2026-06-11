import { onRequest } from 'firebase-functions/v2/https';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-v4-flash';

const systemPrompt = `你是一个求职辅导 AI。你需要根据用户提供的岗位、公司、简历、面试记录等上下文，给出具体、可执行、适合应届生求职场景的建议。输出使用中文 Markdown。不要编造用户没有提供的事实。若上下文不足，请明确说明需要补充的信息。`;

function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || '');
  return message || 'AI 调用失败';
}

export const aiChat = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 120,
    memory: '256MiB'
  },
  async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method not allowed' });
      return;
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      res.status(500).json({ ok: false, error: '服务端未配置 DEEPSEEK_API_KEY' });
      return;
    }

    try {
      const { task = '', context = {}, message = '' } = req.body || {};
      const userPrompt = [
        `任务：${task || 'general'}`,
        `用户要求：${String(message || '').trim() || '请根据上下文生成建议。'}`,
        '上下文 JSON：',
        JSON.stringify(context || {}, null, 2)
      ].join('\n\n');

      const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: process.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          thinking: { type: 'disabled' },
          stream: false,
          temperature: 0.4
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = data?.error?.message || `DeepSeek API 请求失败：${response.status}`;
        res.status(response.status).json({ ok: false, error });
        return;
      }

      const content = data?.choices?.[0]?.message?.content || '';
      res.json({ ok: true, content, usage: data?.usage || {} });
    } catch (error) {
      res.status(500).json({ ok: false, error: safeErrorMessage(error) });
    }
  }
);
