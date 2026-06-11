const PROVIDERS = {
  deepseek: {
    label: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/chat/completions',
    keyName: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-v4-flash',
    models: ['deepseek-v4-flash', 'deepseek-v4-pro']
  },
  qwen: {
    label: 'Qwen',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    keyName: 'QWEN_API_KEY',
    defaultModel: 'qwen-plus',
    models: ['qwen-plus', 'qwen-max', 'qwen-turbo']
  }
};

const systemPrompt = `你是一个求职辅导 AI。你需要根据用户提供的岗位、公司、简历、面试记录等上下文，给出具体、可执行、适合应届生求职场景的建议。输出使用中文 Markdown。不要编造用户没有提供的事实。若上下文不足，请明确说明需要补充的信息。`;

const freeChatSystemPrompt = `你是 JobTracker 的求职辅助 AI。用户可能会自由提问，也可能提供公司、岗位、资料、面试记录等上下文。请基于用户当前选择的上下文回答。不要编造未提供的信息。输出中文 Markdown。如果上下文不足，请说明需要补充哪些信息。`;

function truncateText(value, max = 8000) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}\n\n[网页内容已截断]` : text;
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeWebURL(value) {
  const url = new URL(String(value || '').trim());
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('仅支持读取 http/https URL');
  }
  const host = url.hostname.toLowerCase();
  const isPrivateHost = host === 'localhost'
    || host === '::1'
    || host.startsWith('127.')
    || host.startsWith('10.')
    || host.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
  if (isPrivateHost) {
    throw new Error('不支持读取 localhost 或内网地址');
  }
  return url.href;
}

async function fetchWebContext(webAccess) {
  if (!webAccess?.enabled) return null;
  const url = normalizeWebURL(webAccess.url);
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
      'User-Agent': 'JobTrackerAI/1.0 (+https://jobtracker-fcdee.web.app)'
    }
  });

  if (!response.ok) {
    throw new Error(`网页读取失败：${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  const raw = await response.text();
  const title = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || '';
  const text = contentType.includes('html') ? stripHtml(raw) : raw;
  return {
    url,
    title,
    contentType,
    text: truncateText(text)
  };
}

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

function resolveProvider(providerName = 'deepseek', modelName = '') {
  const providerKey = PROVIDERS[providerName] ? providerName : 'deepseek';
  const provider = PROVIDERS[providerKey];
  const model = modelName || provider.defaultModel;
  if (!provider.models.includes(model)) {
    throw new Error(`不支持的模型：${model}`);
  }
  return { key: providerKey, ...provider, model };
}

function getProviderApiKey(env, provider) {
  const key = env[provider.keyName];
  if (key) return key;
  if (provider.key === 'qwen') throw new Error('Qwen API Key 未配置');
  throw new Error('DeepSeek API Key 未配置');
}

function normalizeTemperature(value) {
  const number = Number(value);
  return [0.2, 0.4, 0.7].includes(number) ? number : 0.4;
}

function buildSystemPrompt(task, customSystemPrompt) {
  const basePrompt = task === 'free_chat' ? freeChatSystemPrompt : systemPrompt;
  const custom = String(customSystemPrompt || '').trim();
  return [basePrompt, custom ? `自定义 Gem 指令：\n${custom}` : ''].filter(Boolean).join('\n\n');
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

    try {
      const {
        provider = 'deepseek',
        model = '',
        thinking = false,
        temperature = 0.4,
        task = '',
        context = {},
        message = '',
        gemId = '',
        customSystemPrompt = '',
        webAccess = {}
      } = await request.json();

      const providerConfig = resolveProvider(provider, model);
      const apiKey = getProviderApiKey(env, providerConfig);
      const webContext = await fetchWebContext(webAccess);
      const mergedContext = webContext
        ? {
            ...context,
            webContext: {
              sourceUrl: webContext.url,
              title: webContext.title,
              contentType: webContext.contentType,
              text: webContext.text
            }
          }
        : context;
      const userPrompt = [
        `任务：${task || 'general'}`,
        gemId ? `Gem：${gemId}` : '',
        `用户要求：${String(message || '').trim() || '请根据上下文生成建议。'}`,
        '上下文 JSON：',
        JSON.stringify(mergedContext || {}, null, 2),
        webContext ? `请在回答末尾用“来源”列出：${webContext.url}` : ''
      ].filter(Boolean).join('\n\n');

      const payload = {
        model: providerConfig.model,
        messages: [
          { role: 'system', content: buildSystemPrompt(task, customSystemPrompt) },
          { role: 'user', content: userPrompt }
        ],
        stream: false
      };

      if (providerConfig.key === 'deepseek') {
        payload.thinking = { type: thinking ? 'enabled' : 'disabled' };
      }

      if (providerConfig.key !== 'deepseek' || !thinking) {
        payload.temperature = normalizeTemperature(temperature);
      }

      const response = await fetch(providerConfig.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return jsonResponse({
          ok: false,
          error: data?.error?.message || `${providerConfig.label} API 请求失败：${response.status}`
        }, response.status, origin);
      }

      return jsonResponse({
        ok: true,
        content: data?.choices?.[0]?.message?.content || '',
        usage: data?.usage || {},
        sources: webContext ? [{ url: webContext.url, title: webContext.title }] : []
      }, 200, origin);
    } catch (error) {
      return jsonResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'AI 调用失败'
      }, 500, origin);
    }
  }
};
