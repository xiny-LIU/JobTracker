const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-v4-flash';

const systemPrompt = `你是一个求职辅导 AI。你需要根据用户提供的岗位、公司、简历、面试记录等上下文，给出具体、可执行、适合应届生求职场景的建议。输出使用中文 Markdown。不要编造用户没有提供的事实。若上下文不足，请明确说明需要补充的信息。`;

function corsHeaders(origin = '*') {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

function jsonResponse(body, status = 200, origin = '*') {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '*';

    if (request.method === 'OPTIONS') {
      return new Response('', { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'Method not allowed' }, 405, origin);
    }

    if (!env.DEEPSEEK_API_KEY) {
      return jsonResponse({ ok: false, error: '服务端未配置 DEEPSEEK_API_KEY' }, 500, origin);
    }

    try {
      const { task = '', context = {}, message = '' } = await request.json();
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
          Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: env.DEEPSEEK_MODEL || DEFAULT_MODEL,
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
        return jsonResponse({
          ok: false,
          error: data?.error?.message || `DeepSeek API 请求失败：${response.status}`
        }, response.status, origin);
      }

      return jsonResponse({
        ok: true,
        content: data?.choices?.[0]?.message?.content || '',
        usage: data?.usage || {}
      }, 200, origin);
    } catch (error) {
      return jsonResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'AI 调用失败'
      }, 500, origin);
    }
  }
};
