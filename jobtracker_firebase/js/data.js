const DataStore = {
    key: 'jobtracker_data',

    get() {
        try {
            const raw = localStorage.getItem(this.key);
            if (raw) return this.normalize(JSON.parse(raw));
        } catch (e) { console.error('读取数据失败', e); }
        return this.getDefault();
    },

    set(data) {
        try {
            localStorage.setItem(this.key, JSON.stringify(this.normalize(data)));
        } catch (e) {
            console.error('保存数据失败', e);
            throw new Error('保存失败：浏览器本地存储不可用或空间不足，请先导出备份并清理浏览器存储。');
        }
    },

    getDefault() {
        return {
            companies: [],
            positions: [],
            resumes: [],
            interviews: [],
            activities: [],
            config: { token: '', gistId: '' }
        };
    },

    normalize(data) {
        const base = this.getDefault();
        const safe = data && typeof data === 'object' ? data : {};
        const companies = Array.isArray(safe.companies)
            ? safe.companies.map((company, index) => ({
                ...company,
                order: Number.isFinite(Number(company.order)) ? Number(company.order) : index * 10,
                city: company.city || ''
            }))
            : [];
        return {
            ...base,
            ...safe,
            companies,
            positions: Array.isArray(safe.positions) ? safe.positions : [],
            resumes: Array.isArray(safe.resumes) ? safe.resumes : [],
            interviews: Array.isArray(safe.interviews) ? safe.interviews : [],
            activities: Array.isArray(safe.activities) ? safe.activities : [],
            config: { ...base.config, ...(safe.config || {}) }
        };
    },

    uid(prefix = 'id') {
        return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    },

    addCompany(company) {
        const data = this.get();
        company.id = this.uid('c');
        company.createdAt = new Date().toISOString();
        data.companies.push(company);
        this.set(data);
        return company;
    },

    updateCompany(id, updates) {
        const data = this.get();
        const idx = data.companies.findIndex(c => c.id === id);
        if (idx >= 0) {
            data.companies[idx] = { ...data.companies[idx], ...updates, updatedAt: new Date().toISOString() };
            this.set(data);
        }
    },

    addPosition(pos) {
        const data = this.get();
        pos.id = this.uid('p');
        pos.createdAt = new Date().toISOString();
        pos.updatedAt = pos.createdAt;
        data.positions.push(pos);
        this.addActivity(pos.id, pos.status, '新增投递', pos.createdAt, data);
        this.set(data);
        return pos;
    },

    updatePosition(id, updates) {
        const data = this.get();
        const idx = data.positions.findIndex(p => p.id === id);
        if (idx >= 0) {
            const old = data.positions[idx];
            const now = new Date().toISOString();
            data.positions[idx] = { ...old, ...updates, updatedAt: now };
            if (updates.status && updates.status !== old.status) {
                this.addActivity(id, updates.status, `${old.status} → ${updates.status}`, now.split('T')[0], data);
            }
            this.set(data);
        }
    },

    deletePosition(id) {
        const data = this.get();
        data.positions = data.positions.filter(p => p.id !== id);
        data.interviews = data.interviews.filter(i => i.positionId !== id);
        data.activities = data.activities.filter(a => a.positionId !== id);
        this.set(data);
    },

    addInterview(interview) {
        const data = this.get();
        interview.id = this.uid('i');
        interview.createdAt = new Date().toISOString();
        data.interviews.push(interview);
        const pos = data.positions.find(p => p.id === interview.positionId);
        if (pos && !['Offer','拒绝','接受'].includes(pos.status)) {
            const map = { '笔试': '笔试', '一面': '一面', '二面': '二面', '三面': '三面', 'HR面': 'HR面' };
            if (map[interview.round]) {
                pos.status = map[interview.round];
                pos.updatedAt = interview.createdAt;
                this.addActivity(pos.id, pos.status, `${interview.round}完成`, interview.date, data);
            }
        }
        this.set(data);
        return interview;
    },

    updateInterview(id, updates) {
        const data = this.get();
        const idx = data.interviews.findIndex(i => i.id === id);
        if (idx >= 0) {
            data.interviews[idx] = { ...data.interviews[idx], ...updates };
            this.set(data);
        }
    },

    deleteInterview(id) {
        const data = this.get();
        data.interviews = data.interviews.filter(i => i.id !== id);
        this.set(data);
    },

    addResume(resume) {
        const data = this.get();
        resume.id = this.uid('r');
        resume.createdAt = new Date().toISOString();
        data.resumes.push(resume);
        this.set(data);
        return resume;
    },

    updateResume(id, updates) {
        const data = this.get();
        const idx = data.resumes.findIndex(r => r.id === id);
        if (idx >= 0) {
            data.resumes[idx] = { ...data.resumes[idx], ...updates };
            this.set(data);
        }
    },

    deleteResume(id) {
        const data = this.get();
        data.resumes = data.resumes.filter(r => r.id !== id);
        data.positions.forEach(p => { if (p.resumeId === id) p.resumeId = ''; });
        this.set(data);
    },

    addActivity(positionId, type, notes, date, currentData = null) {
        const data = currentData || this.get();
        data.activities.push({
            id: this.uid('a'),
            positionId, type, notes, date,
            createdAt: new Date().toISOString()
        });
        if (data.activities.length > 100) data.activities = data.activities.slice(-100);
        if (!currentData) this.set(data);
    },

    getConfig() {
        return this.get().config || {};
    },

    setConfig(config) {
        const data = this.get();
        data.config = { ...data.config, ...config };
        this.set(data);
    },

    loadDemo() {
        const demo = {
            companies: [
                { id: 'c_demo1', name: '字节跳动', industry: '互联网', scale: '大厂', website: 'https://www.bytedance.com', notes: '旗下抖音、TikTok。技术栈Go/Python为主。', createdAt: new Date().toISOString() },
                { id: 'c_demo2', name: '美团', industry: '互联网', scale: '大厂', website: 'https://www.meituan.com', notes: '本地生活服务龙头，重视基本功。', createdAt: new Date().toISOString() },
                { id: 'c_demo3', name: '小红书', industry: '互联网', scale: '成长型', website: 'https://www.xiaohongshu.com', notes: '生活方式平台，产品驱动。', createdAt: new Date().toISOString() }
            ],
            resumes: [
                { id: 'r_demo1', name: '后端-通用版', type: 'resume', target: '后端开发', version: 'v2.0', content: '教育背景：XX大学 计算机科学\n技能：Go, Redis, MySQL, Kafka\n项目：分布式缓存系统...', fileName: 'resume_backend_v2.pdf', createdAt: new Date().toISOString() },
                { id: 'r_demo2', name: '后端-字节版', type: 'resume', target: '后端开发', version: 'v1.1', content: '突出高并发经验、推荐系统相关...', fileName: 'resume_backend_bytedance.pdf', createdAt: new Date().toISOString() },
                { id: 'r_demo3', name: '自我介绍-1分钟', type: 'intro', target: '通用', version: 'v1', content: '您好，我是XXX，XX大学计算机专业应届...', fileName: '', createdAt: new Date().toISOString() }
            ],
            positions: [
                { id: 'p_demo1', companyId: 'c_demo1', title: '后端开发工程师', jd: '负责抖音电商业务后端，要求熟悉Go/Java，有分布式系统经验。', status: '二面', resumeId: 'r_demo2', priority: 5, salary: '25k-35k', location: '北京', deadline: '2026-06-15', createdAt: new Date(Date.now()-20*86400000).toISOString(), updatedAt: new Date().toISOString() },
                { id: 'p_demo2', companyId: 'c_demo2', title: '后台开发工程师', jd: '美团外卖核心链路，要求扎实计算机基础。', status: '一面', resumeId: 'r_demo1', priority: 4, salary: '22k-30k', location: '北京', deadline: '2026-06-20', createdAt: new Date(Date.now()-15*86400000).toISOString(), updatedAt: new Date().toISOString() },
                { id: 'p_demo3', companyId: 'c_demo3', title: 'Java开发工程师', jd: '社区电商业务，要求Java基础扎实。', status: '投递', resumeId: '', priority: 3, salary: '20k-28k', location: '上海', deadline: '', createdAt: new Date(Date.now()-5*86400000).toISOString(), updatedAt: new Date().toISOString() }
            ],
            interviews: [
                { id: 'i_demo1', positionId: 'p_demo1', round: '一面', date: '2026-05-10', interviewer: '张三', questions: 'Redis集群方案\nMySQL索引优化\nGo的GMP模型', selfRating: 4, notes: 'Redis答得不错，MySQL索引有点卡壳。', mood: '平稳', result: '通过', createdAt: new Date().toISOString() },
                { id: 'i_demo2', positionId: 'p_demo1', round: '二面', date: '2026-05-18', interviewer: '李四', questions: '设计秒杀系统\n分布式事务\nKafka消息丢失', selfRating: 3, notes: '系统设计思路有点乱，需多练。', mood: '紧张', result: '待反馈', createdAt: new Date().toISOString() },
                { id: 'i_demo3', positionId: 'p_demo2', round: '一面', date: '2026-05-15', interviewer: '王五', questions: 'LRU缓存实现\nTCP三次握手\n线程池参数', selfRating: 4, notes: '算法题一次AC，网络部分完整。', mood: '超水平发挥', result: '通过', createdAt: new Date().toISOString() }
            ],
            activities: [
                { id: 'a1', positionId: 'p_demo1', type: '投递', date: '2026-05-02', notes: '官网投递', createdAt: new Date(Date.now()-20*86400000).toISOString() },
                { id: 'a2', positionId: 'p_demo1', type: '笔试', date: '2026-05-07', notes: '3道算法+2道SQL', createdAt: new Date(Date.now()-15*86400000).toISOString() },
                { id: 'a3', positionId: 'p_demo1', type: '一面', date: '2026-05-10', notes: '通过', createdAt: new Date(Date.now()-12*86400000).toISOString() },
                { id: 'a4', positionId: 'p_demo1', type: '二面', date: '2026-05-18', notes: '待反馈', createdAt: new Date(Date.now()-4*86400000).toISOString() },
                { id: 'a5', positionId: 'p_demo2', type: '投递', date: '2026-05-07', notes: '内推', createdAt: new Date(Date.now()-15*86400000).toISOString() },
                { id: 'a6', positionId: 'p_demo2', type: '一面', date: '2026-05-15', notes: '通过', createdAt: new Date(Date.now()-7*86400000).toISOString() },
                { id: 'a7', positionId: 'p_demo3', type: '投递', date: '2026-05-17', notes: '', createdAt: new Date(Date.now()-5*86400000).toISOString() }
            ],
            config: { token: '', gistId: '' }
        };
        this.set(demo);
    },

    clear() {
        localStorage.removeItem(this.key);
    }
};
