const Sync = {
    async push(data, token, gistId) {
        const url = gistId
            ? `https://api.github.com/gists/${gistId}`
            : 'https://api.github.com/gists';

        const res = await fetch(url, {
            method: gistId ? 'PATCH' : 'POST',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify({
                description: 'JobTracker 求职数据备份',
                public: false,
                files: {
                    'jobtracker.json': {
                        content: JSON.stringify(data, null, 2)
                    }
                }
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || `HTTP ${res.status}`);
        }

        const result = await res.json();
        return { gistId: result.id, url: result.html_url };
    },

    async pull(token, gistId) {
        const res = await fetch(`https://api.github.com/gists/${gistId}`, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!res.ok) throw new Error('拉取失败');

        const result = await res.json();
        const file = result.files['jobtracker.json'];
        if (!file) throw new Error('Gist中未找到jobtracker.json');

        if (file.truncated) {
            const rawRes = await fetch(file.raw_url);
            if (!rawRes.ok) throw new Error('拉取完整内容失败');
            return JSON.parse(await rawRes.text());
        }

        return JSON.parse(file.content);
    },

    async test(token) {
        const res = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': `token ${token}` }
        });
        return res.ok;
    }
};