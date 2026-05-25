const app = {
    data: null,
    currentView: 'dashboard',
    currentDetail: null,
    resumeFilter: 'all',

    init() {
        this.data = DataStore.get();
        if (!this.data.config) this.data.config = { token: '', gistId: '' };
        this.bindTabs();
        this.render();
        this.updateSyncBadge();
        if (this.data.config.token && this.data.config.gistId) {
            this.backgroundSync();
        }
    },

    bindTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.switchView(btn.dataset.view);
            });
        });
        document.getElementById('sync-btn').addEventListener('click', () => this.manualSync());

        // Modal footer 事件委托
        document.getElementById('modal-footer').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            if (this[action]) this[action]();
        });
    },

    switchView(view) {
        this.currentView = view;
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(`view-${view}`).classList.add('active');
        this.render();
    },

    render() {
        if (this.currentView === 'dashboard') this.renderDashboard();
        else if (this.currentView === 'positions') this.renderPositions();
        else if (this.currentView === 'resumes') this.renderResumes();
        else if (this.currentView === 'analytics') this.renderAnalytics();
        else if (this.currentView === 'settings') this.renderSettings();
    },

    renderDashboard() {
        const now = new Date();
        const weekAgo = new Date(now - 7 * 86400000);
        const total = this.data.positions.length;
        const interviewing = this.data.positions.filter(p => ['一面','二面','三面','HR面'].includes(p.status)).length;
        const offers = this.data.positions.filter(p => ['Offer','接受'].includes(p.status)).length;
        const followUp = this.data.positions.filter(p => {
            if (['Offer','接受','拒绝'].includes(p.status)) return false;
            return (now - new Date(p.updatedAt)) > 7 * 86400000;
        }).length;

        document.getElementById('stat-total').textContent = total;
        document.getElementById('stat-interviewing').textContent = interviewing;
        document.getElementById('stat-offers').textContent = offers;
        document.getElementById('stat-followup').textContent = followUp;

        // Funnel
        const stages = ['投递', '笔试', '一面', '二面', '三面', 'HR面', 'Offer'];
        const counts = stages.map(s => this.data.positions.filter(p => {
            const idx = stages.indexOf(p.status);
            return idx >= stages.indexOf(s) && p.status !== '拒绝';
        }).length);
        const max = Math.max(...counts, 1);
        const colors = ['#94a3b8', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#059669'];

        document.getElementById('funnel-container').innerHTML = stages.map((s, i) => {
            const prev = i > 0 ? counts[i-1] : counts[i];
            const conv = i > 0 && prev > 0 ? Math.round((counts[i]/prev)*100) : '-';
            return `<div class="funnel-row">
                <div class="funnel-label">${s}</div>
                <div class="funnel-bar-wrap"><div class="funnel-bar" style="width:${(counts[i]/max)*100}%;background:${colors[i]}">${counts[i]}</div></div>
                <div class="funnel-rate">${conv}%</div>
            </div>`;
        }).join('');

        // Reminders
        const reminders = [];
        this.data.positions.forEach(p => {
            if (p.deadline) {
                const days = Math.ceil((new Date(p.deadline) - now) / 86400000);
                if (days <= 3 && days >= -1 && !['Offer','接受','拒绝'].includes(p.status)) {
                    const c = this.getCompany(p.companyId);
                    reminders.push({ text: `${c?.name} ${p.title} ${days < 0 ? '已逾期' : days + '天后截止'}`, date: p.deadline, urgent: days < 0 });
                }
            }
        });
        this.data.interviews.forEach(i => {
            if (i.result === '待反馈') {
                const days = Math.floor((now - new Date(i.date)) / 86400000);
                if (days >= 3) {
                    const p = this.data.positions.find(x => x.id === i.positionId);
                    const c = p ? this.getCompany(p.companyId) : null;
                    reminders.push({ text: `${c?.name || ''} ${i.round} 已${days}天未反馈`, date: i.date, urgent: days > 7 });
                }
            }
        });

        document.getElementById('reminder-list').innerHTML = reminders.length === 0
            ? '<div style="text-align:center;color:#94a3b8;padding:20px;">暂无待办 🎉</div>'
            : reminders.sort((a,b) => new Date(a.date) - new Date(b.date)).map(r => `
                <div class="reminder-item ${r.urgent ? 'urgent' : 'warn'}">
                    <div class="dot"></div>
                    <div class="reminder-text"><div>${r.text}</div><div class="reminder-date">${r.date}</div></div>
                </div>`).join('');

        // Activities
        const acts = [...this.data.activities].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
        document.getElementById('recent-activities').innerHTML = acts.map(a => {
            const p = this.data.positions.find(x => x.id === a.positionId);
            const c = p ? this.getCompany(p.companyId) : null;
            return `<div class="activity-item">
                <div class="activity-date">${a.date}</div>
                <span class="activity-badge badge-${a.type}">${a.type}</span>
                <div class="activity-content">${c?.name || ''} · ${p?.title || ''}</div>
                ${a.notes ? `<div class="activity-note">${a.notes}</div>` : ''}
            </div>`;
        }).join('') || '<div style="text-align:center;color:#94a3b8;padding:20px;">暂无记录</div>';
    },

    renderCompaniesSection(search = '') {
        const container = document.getElementById('company-section');
        if (!container) return;

        let companies = this.data.companies;
        if (search) {
            companies = companies.filter(c => (c.name + c.industry + c.scale + c.notes).toLowerCase().includes(search));
        }

        if (companies.length === 0) {
            container.innerHTML = this.data.companies.length === 0
                ? '<div class="company-empty">还没有公司。请先点击右上角“添加公司”，保存后这里会显示公司卡片。</div>'
                : '';
            return;
        }

        container.innerHTML = `
            <div class="company-section-title">
                <span>公司列表（${companies.length}）</span>
                <span>保存公司后，可在对应公司卡片中继续添加岗位</span>
            </div>
            <div class="company-grid">
                ${companies.map(c => {
                    const count = this.data.positions.filter(p => p.companyId === c.id).length;
                    return `<div class="company-card">
                        <div class="company-card-header">
                            <div class="card-logo">${(c.name || '公')[0]}</div>
                            <div>
                                <div class="company-card-name">${c.name || '未命名公司'}</div>
                                <div class="company-card-meta">${c.industry || '未知行业'} · ${c.scale || '未知规模'} · ${count} 个岗位</div>
                            </div>
                        </div>
                        ${c.notes ? `<div class="company-card-meta">${c.notes}</div>` : ''}
                        <div class="company-card-actions">
                            <button class="card-btn" onclick="app.openPositionModal(null, '${c.id}')">添加岗位</button>
                            <button class="card-btn" onclick="app.openModal('company', '${c.id}')">编辑公司</button>
                        </div>
                    </div>`;
                }).join('')}
            </div>`;
    },

    renderPositions() {
        const search = document.getElementById('pos-search').value.toLowerCase();
        const status = document.getElementById('pos-status').value;
        const priority = document.getElementById('pos-priority').value;

        this.renderCompaniesSection(search);

        let list = this.data.positions.filter(p => {
            const c = this.getCompany(p.companyId);
            const matchSearch = !search || (c?.name + p.title + p.location).toLowerCase().includes(search);
            const matchStatus = !status || p.status === status;
            const matchPriority = !priority || p.priority === parseInt(priority);
            return matchSearch && matchStatus && matchPriority;
        });
        list.sort((a, b) => b.priority - a.priority || new Date(b.updatedAt) - new Date(a.updatedAt));

        document.getElementById('positions-grid').innerHTML = list.map(p => {
            const c = this.getCompany(p.companyId);
            const r = this.data.resumes.find(x => x.id === p.resumeId);
            const ivs = this.data.interviews.filter(i => i.positionId === p.id).sort((a,b) => new Date(b.date) - new Date(a.date));
            const last = ivs[0];
            const stars = Array(5).fill(0).map((_,i) => `<span class="card-star ${i < p.priority ? 'active' : ''}">★</span>`).join('');
            return `<div class="card" onclick="app.openDetail('${p.id}')">
                <div class="card-header">
                    <div class="card-title">
                        <div class="card-logo">${(c?.name || '公')[0]}</div>
                        <div><div class="card-name">${c?.name || '未知'}</div><div class="card-role">${p.title}</div></div>
                    </div>
                    <span class="activity-badge badge-${p.status}">${p.status}</span>
                </div>
                <div class="card-stars">${stars}</div>
                <div class="card-meta"><span>📍 ${p.location || '未知'}</span><span>💰 ${p.salary || '面议'}</span></div>
                ${r ? `<div class="card-resume">📄 ${r.name}</div>` : ''}
                <div class="card-footer">
                    <span class="card-footer-text">${last ? `最近: ${last.round} ${last.date}` : '暂无面试'}</span>
                    <div class="card-actions">
                        <button class="card-btn" onclick="event.stopPropagation();app.openPositionModal('${p.id}')">编辑</button>
                        <button class="card-btn" onclick="event.stopPropagation();app.advance('${p.id}')">推进 ➜</button>
                        <button class="card-btn" onclick="event.stopPropagation();app.openInterviewModal('${p.id}')">记面试</button>
                    </div>
                </div>
            </div>`;
        }).join('') || '<div style="grid-column:1/-1;text-align:center;color:#94a3b8;padding:40px;">暂无岗位，点击右上角添加</div>';
    },

    advance(id) {
        const p = this.data.positions.find(x => x.id === id);
        const flow = ['投递', '笔试', '一面', '二面', '三面', 'HR面', 'Offer'];
        const idx = flow.indexOf(p.status);
        if (idx >= 0 && idx < flow.length - 1) {
            DataStore.updatePosition(id, { status: flow[idx + 1] });
            this.data = DataStore.get();
            this.renderPositions();
            this.updateSyncBadge();
        }
    },

    renderResumes() {
        let list = this.data.resumes;
        if (this.resumeFilter !== 'all') list = list.filter(r => r.type === this.resumeFilter);
        const icons = { resume: '📄', intro: '🎤', cover: '✉️', other: '📁' };

        document.getElementById('resumes-grid').innerHTML = list.map(r => {
            const linked = this.data.positions.filter(p => p.resumeId === r.id).length;
            return `<div class="resume-card">
                <div class="resume-header">
                    <div style="display:flex;gap:10px;align-items:center;">
                        <div class="resume-icon ${r.type === 'resume' ? 'pdf' : r.type === 'intro' ? 'mic' : r.type === 'cover' ? 'mail' : 'file'}">${icons[r.type]}</div>
                        <div><div class="resume-name">${r.name}</div><div class="resume-type">${r.type === 'resume' ? '简历' : r.type === 'intro' ? '自我介绍' : r.type === 'cover' ? '求职信' : '其他'} · ${r.target || '通用'}</div></div>
                    </div>
                    <button class="btn-icon" onclick="app.editResume('${r.id}')">✏️</button>
                </div>
                ${r.version ? `<div class="resume-version">${r.version}</div>` : ''}
                <div class="resume-content">${r.content || '无内容'}</div>
                <div class="resume-footer"><span>${linked} 个岗位关联</span>${r.fileName ? `<span>📎 ${r.fileName}</span>` : ''}</div>
            </div>`;
        }).join('') || '<div style="grid-column:1/-1;text-align:center;color:#94a3b8;padding:40px;">暂无资料</div>';

        document.querySelectorAll('.sidebar-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.cat === this.resumeFilter);
        });
    },

    filterResumes(cat) {
        this.resumeFilter = cat;
        this.renderResumes();
    },

    renderAnalytics() {
        const typeMap = {};
        this.data.positions.forEach(p => {
            let t = p.title.includes('后端') || p.title.includes('后台') ? '后端' :
                    p.title.includes('前端') ? '前端' :
                    p.title.includes('产品') ? '产品' :
                    p.title.includes('算法') ? '算法' : '其他';
            if (!typeMap[t]) typeMap[t] = { total: 0, iv: 0, offer: 0 };
            typeMap[t].total++;
            if (['一面','二面','三面','HR面','Offer','接受'].includes(p.status)) typeMap[t].iv++;
            if (['Offer','接受'].includes(p.status)) typeMap[t].offer++;
        });

        const typeHtml = Object.entries(typeMap).map(([t, s]) => {
            const ivRate = s.total ? Math.round(s.iv/s.total*100) : 0;
            const ofRate = s.iv ? Math.round(s.offer/s.iv*100) : 0;
            return `<div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><span class="font-medium">${t}</span><span style="font-size:12px;color:#64748b;">${s.total} 投递</span></div><div style="display:flex;gap:16px;font-size:12px;"><div>面试率 <strong style="color:#3b82f6;">${ivRate}%</strong></div><div>Offer率 <strong style="color:#10b981;">${ofRate}%</strong></div></div></div>`;
        }).join('');

        const resumeMap = {};
        this.data.resumes.forEach(r => {
            const ivs = this.data.interviews.filter(i => {
                const p = this.data.positions.find(x => x.id === i.positionId);
                return p && p.resumeId === r.id;
            });
            const pass = ivs.filter(i => i.result === '通过').length;
            resumeMap[r.name] = { total: ivs.length, pass, rate: ivs.length ? Math.round(pass/ivs.length*100) : 0 };
        });
        const resumeHtml = Object.entries(resumeMap).map(([n, s]) => `<div class="panel"><div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span class="font-medium">${n}</span><span style="font-size:12px;color:#64748b;">${s.total} 场面试</span></div><div style="font-size:12px;">通过率 <strong style="color:${s.rate>=60?'#10b981':s.rate>=40?'#3b82f6':'#f59e0b'};">${s.rate}%</strong></div></div>`).join('');

        const words = {};
        this.data.interviews.forEach(i => {
            if (i.questions) {
                ['Redis','MySQL','Kafka','Docker','K8s','算法','网络','OS','Go','Java','微服务','分布式','设计模式','并发'].forEach(k => {
                    if (i.questions.includes(k)) words[k] = (words[k]||0)+1;
                });
            }
        });
        const wordHtml = Object.entries(words).sort((a,b) => b[1]-a[1]).map(([w,c]) => `<span class="tag" style="background:${c>=3?'#fee2e2':c>=2?'#fef3c7':'#f1f5f9'};color:${c>=3?'#991b1b':c>=2?'#92400e':'#475569'};">${w} (${c})</span>`).join('') || '<span style="color:#94a3b8;">多记录面试问题即可生成</span>';

        const moods = {};
        this.data.interviews.forEach(i => { moods[i.mood||'一般'] = (moods[i.mood||'一般']||0)+1; });
        const totalMood = Object.values(moods).reduce((a,b)=>a+b,0);
        const moodColors = { '紧张':'#f59e0b', '平稳':'#3b82f6', '超水平发挥':'#10b981', '被问懵':'#ef4444', '一般':'#94a3b8' };
        const moodHtml = Object.entries(moods).map(([m,c]) => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><span style="width:60px;font-size:12px;">${m}</span><div style="flex:1;height:6px;background:#f1f5f9;border-radius:3px;overflow:hidden;"><div style="width:${totalMood?Math.round(c/totalMood*100):0}%;height:100%;background:${moodColors[m]||'#94a3b8'};border-radius:3px;"></div></div><span style="width:24px;text-align:right;font-size:12px;">${c}</span></div>`).join('');

        document.getElementById('analytics-grid').innerHTML = `
            <div class="panel"><h3 style="font-size:14px;font-weight:700;margin-bottom:16px;">岗位类型表现</h3>${typeHtml || '<div style="color:#94a3b8;">数据不足</div>'}</div>
            <div class="panel"><h3 style="font-size:14px;font-weight:700;margin-bottom:16px;">简历版本效果</h3>${resumeHtml || '<div style="color:#94a3b8;">数据不足</div>'}</div>
            <div class="panel" style="grid-column:1/-1;"><h3 style="font-size:14px;font-weight:700;margin-bottom:16px;">面试知识盲区</h3><div style="display:flex;flex-wrap:wrap;gap:6px;">${wordHtml}</div></div>
            <div class="panel"><h3 style="font-size:14px;font-weight:700;margin-bottom:16px;">面试情绪分布</h3>${moodHtml || '<div style="color:#94a3b8;">暂无数据</div>'}</div>
        `;
    },

    renderSettings() {
        const cfg = this.data.config || {};
        const hasToken = !!cfg.token;
        document.getElementById('sync-config').classList.toggle('hidden', hasToken);
        document.getElementById('sync-active').classList.toggle('hidden', !hasToken);
        if (!hasToken) {
            document.getElementById('github-token').value = cfg.token || '';
            document.getElementById('gist-id').value = cfg.gistId || '';
        } else {
            document.getElementById('sync-gist-id').textContent = cfg.gistId || '自动创建';
        }
    },

    async saveSyncConfig() {
        const token = document.getElementById('github-token').value.trim();
        let gistId = document.getElementById('gist-id').value.trim();
        if (!token) return alert('请输入 Token');
        try {
            const ok = await Sync.test(token);
            if (!ok) throw new Error('Token 无效');
            if (gistId) {
                try {
                    const remote = DataStore.normalize(await Sync.pull(token, gistId));
                    if (confirm('检测到云端已有数据，是否覆盖本地？')) {
                        DataStore.set(remote);
                        this.data = DataStore.get();
                    }
                } catch (e) {
                    await Sync.push(DataStore.get(), token, gistId);
                }
            } else {
                const result = await Sync.push(DataStore.get(), token);
                gistId = result.gistId;
            }
            DataStore.setConfig({ token, gistId });
            this.data = DataStore.get();
            this.renderSettings();
            this.updateSyncBadge();
            alert('同步配置成功！');
        } catch (e) {
            alert('配置失败：' + e.message);
        }
    },

    async manualSync() {
        const cfg = this.data.config;
        if (!cfg.token) { this.switchView('settings'); return; }
        const btn = document.getElementById('sync-btn');
        btn.style.opacity = '0.5';
        try {
            if (cfg.gistId) {
                try {
                    const remote = DataStore.normalize(await Sync.pull(cfg.token, cfg.gistId));
                    DataStore.set(remote);
                    this.data = DataStore.get();
                    this.render();
                } catch (e) {}
            }
            const result = await Sync.push(DataStore.get(), cfg.token, cfg.gistId);
            if (!cfg.gistId && result.gistId) {
                DataStore.setConfig({ gistId: result.gistId });
                this.data = DataStore.get();
            }
            this.updateSyncBadge();
            alert('同步成功');
        } catch (e) {
            alert('同步失败：' + e.message);
        } finally {
            btn.style.opacity = '1';
        }
    },

    async backgroundSync() {
        const cfg = this.data.config;
        if (!cfg.token || !cfg.gistId) return;
        try {
            await Sync.push(DataStore.get(), cfg.token, cfg.gistId);
            this.updateSyncBadge();
        } catch (e) { console.log('后台同步失败', e); }
    },

    disconnectSync() {
        if (!confirm('确定断开同步？本地数据保留，Token将被清除。')) return;
        DataStore.setConfig({ token: '', gistId: '' });
        this.data = DataStore.get();
        this.renderSettings();
        this.updateSyncBadge();
    },

    updateSyncBadge() {
        const cfg = this.data.config;
        const badge = document.getElementById('sync-status');
        if (cfg.token && cfg.gistId) {
            badge.textContent = '已同步';
            badge.classList.add('synced');
        } else {
            badge.textContent = '本地';
            badge.classList.remove('synced');
        }
    },

    exportJSON() {
        const blob = new Blob([JSON.stringify(this.data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `jobtracker_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    },

    importJSON(input) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const data = DataStore.normalize(JSON.parse(e.target.result));
                if (confirm('导入将覆盖现有数据，确定？')) {
                    DataStore.set(data);
                    this.data = DataStore.get();
                    this.render();
                    alert('导入成功');
                }
            } catch { alert('文件格式错误'); }
        };
        reader.readAsText(file);
        input.value = '';
    },

    loadDemoData() {
        if (!confirm('加载演示数据将覆盖现有内容，确定？')) return;
        DataStore.loadDemo();
        this.data = DataStore.get();
        this.render();
    },

    clearAllData() {
        if (!confirm('确定清空所有数据？不可恢复！')) return;
        DataStore.clear();
        this.data = DataStore.get();
        this.render();
    },

    openModal(type, id = null, presetCompanyId = '') {
        const backdrop = document.getElementById('modal-backdrop');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');
        const footer = document.getElementById('modal-footer');
        backdrop.classList.remove('hidden');

        if (type === 'company') {
            title.textContent = id ? '编辑公司' : '添加公司';
            const c = id ? this.data.companies.find(x => x.id === id) : {};
            body.innerHTML = `<input type="hidden" id="m-company-id" value="${id||''}">
                <div class="form-group"><label>公司名称 *</label><input id="m-c-name" value="${c.name||''}"></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group"><label>行业</label><input id="m-c-industry" value="${c.industry||''}"></div>
                    <div class="form-group"><label>规模</label><select id="m-c-scale"><option value="">未知</option>${['初创','成长型','大厂','外企','国企'].map(s => `<option value="${s}" ${c.scale===s?'selected':''}>${s}</option>`).join('')}</select></div>
                </div>
                <div class="form-group"><label>官网</label><input id="m-c-website" value="${c.website||''}"></div>
                <div class="form-group"><label>备注</label><textarea id="m-c-notes" rows="3">${c.notes||''}</textarea></div>`;
            footer.innerHTML = `${id?'<button class="btn-danger" data-action="deleteCompany">删除</button>':''}<div style="margin-left:auto;display:flex;gap:8px;"><button class="btn-secondary" data-action="closeModal">取消</button><button class="btn-primary" data-action="saveCompany">保存</button></div>`;
        } else if (type === 'position') {
            const p = id ? (this.data.positions.find(x => x.id === id) || {}) : {};
            const isEdit = !!p.id;
            title.textContent = isEdit ? '编辑岗位' : '添加岗位';
            const companyId = p.companyId || presetCompanyId || this.data.companies[0]?.id || '';
            body.innerHTML = `<input type="hidden" id="m-pos-id" value="${isEdit ? p.id : ''}">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group"><label>岗位名称 *</label><input id="m-pos-title" value="${p.title||''}"></div>
                    <div class="form-group"><label>所属公司</label><select id="m-pos-company">${this.data.companies.map(c => `<option value="${c.id}" ${companyId===c.id?'selected':''}>${c.name}</option>`).join('')}</select></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group"><label>状态</label><select id="m-pos-status">${['投递','笔试','一面','二面','三面','HR面','Offer','拒绝','接受'].map(s => `<option value="${s}" ${p.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
                    <div class="form-group"><label>意愿度</label><div class="star-rating" id="m-pos-stars"></div><input type="hidden" id="m-pos-priority" value="${p.priority||3}"></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group"><label>地点</label><input id="m-pos-location" value="${p.location||''}"></div>
                    <div class="form-group"><label>薪资</label><input id="m-pos-salary" value="${p.salary||''}"></div>
                </div>
                <div class="form-group"><label>关联简历</label><select id="m-pos-resume"><option value="">不关联</option>${this.data.resumes.map(r => `<option value="${r.id}" ${p.resumeId===r.id?'selected':''}>${r.name}</option>`).join('')}</select></div>
                <div class="form-group"><label>岗位JD</label><textarea id="m-pos-jd" rows="4">${p.jd||''}</textarea></div>
                <div class="form-group"><label>Deadline</label><input type="date" id="m-pos-deadline" value="${p.deadline||''}"></div>`;
            setTimeout(() => this.renderStarInput('m-pos-stars', 'm-pos-priority', p.priority || 3), 0);
            footer.innerHTML = `${isEdit?'<button class="btn-danger" data-action="deletePosition">删除</button>':''}<div style="margin-left:auto;display:flex;gap:8px;"><button class="btn-secondary" data-action="closeModal">取消</button><button class="btn-primary" data-action="savePosition">保存</button></div>`;
        } else if (type === 'resume') {
            title.textContent = id ? '编辑资料' : '添加资料';
            const r = id ? this.data.resumes.find(x => x.id === id) : {};
            body.innerHTML = `<input type="hidden" id="m-res-id" value="${id||''}">
                <div class="form-group"><label>资料名称 *</label><input id="m-res-name" value="${r.name||''}"></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group"><label>类型</label><select id="m-res-type">${['resume','intro','cover','other'].map(t => `<option value="${t}" ${r.type===t?'selected':''}>${t==='resume'?'简历':t==='intro'?'自我介绍':t==='cover'?'求职信':'其他'}</option>`).join('')}</select></div>
                    <div class="form-group"><label>目标岗位</label><input id="m-res-target" value="${r.target||''}"></div>
                </div>
                <div class="form-group"><label>版本说明</label><input id="m-res-version" value="${r.version||''}"></div>
                <div class="form-group"><label>内容</label><textarea id="m-res-content" rows="6">${r.content||''}</textarea></div>
                <div class="form-group"><label>文件名/链接</label><input id="m-res-file" value="${r.fileName||''}"></div>`;
            footer.innerHTML = `${id?'<button class="btn-danger" data-action="deleteResume">删除</button>':''}<div style="margin-left:auto;display:flex;gap:8px;"><button class="btn-secondary" data-action="closeModal">取消</button><button class="btn-primary" data-action="saveResume">保存</button></div>`;
        } else if (type === 'interview') {
            const posId = id;
            const ivId = arguments[2] || null;
            const iv = ivId ? this.data.interviews.find(x => x.id === ivId) : {};
            title.textContent = ivId ? '编辑面试' : '记录面试';
            body.innerHTML = `<input type="hidden" id="m-iv-id" value="${ivId||''}"><input type="hidden" id="m-iv-pos" value="${posId}">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group"><label>轮次</label><select id="m-iv-round">${['笔试','一面','二面','三面','HR面','其他'].map(r => `<option value="${r}" ${iv.round===r?'selected':''}>${r}</option>`).join('')}</select></div>
                    <div class="form-group"><label>日期</label><input type="date" id="m-iv-date" value="${iv.date||new Date().toISOString().split('T')[0]}"></div>
                </div>
                <div class="form-group"><label>面试官</label><input id="m-iv-interviewer" value="${iv.interviewer||''}"></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group"><label>自我评分</label><input type="range" id="m-iv-rating" min="1" max="5" value="${iv.selfRating||3}" oninput="document.getElementById('rating-disp').textContent=this.value+'星'"><span id="rating-disp" style="font-size:12px;color:#3b82f6;font-weight:600;">${iv.selfRating||3}星</span></div>
                    <div class="form-group"><label>结果</label><select id="m-iv-result">${['待反馈','通过','挂','待定'].map(r => `<option value="${r}" ${iv.result===r?'selected':''}>${r}</option>`).join('')}</select></div>
                </div>
                <div class="form-group"><label>情绪</label><div style="display:flex;gap:6px;flex-wrap:wrap;">${['紧张','平稳','超水平发挥','被问懵','一般'].map(m => `<button type="button" class="mood-btn ${(iv.mood||'平稳')===m?'active':''}" onclick="app.setMoodBtn(this)" data-mood="${m}">${m}</button>`).join('')}</div><input type="hidden" id="m-iv-mood" value="${iv.mood||'平稳'}"></div>
                <div class="form-group"><label>面试问题（每行一个）</label><textarea id="m-iv-questions" rows="4">${iv.questions||''}</textarea></div>
                <div class="form-group"><label>复盘笔记</label><textarea id="m-iv-notes" rows="4">${iv.notes||''}</textarea></div>`;
            footer.innerHTML = `${ivId?'<button class="btn-danger" data-action="deleteInterview">删除</button>':''}<div style="margin-left:auto;display:flex;gap:8px;"><button class="btn-secondary" data-action="closeModal">取消</button><button class="btn-primary" data-action="saveInterview">保存</button></div>`;
        }
    },

    renderStarInput(containerId, inputId, value) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = Array(5).fill(0).map((_,i) => `<span class="star ${i < value ? 'active' : ''}" onclick="app.setStar('${containerId}', '${inputId}', ${i+1})">★</span>`).join('');
    },

    setStar(containerId, inputId, val) {
        document.getElementById(inputId).value = val;
        this.renderStarInput(containerId, inputId, val);
    },

    setMoodBtn(btn) {
        document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('m-iv-mood').value = btn.dataset.mood;
    },

    closeModal() {
        document.getElementById('modal-backdrop').classList.add('hidden');
    },

    saveCompany() {
        const id = document.getElementById('m-company-id').value;
        const name = document.getElementById('m-c-name').value.trim();
        if (!name) return alert('请输入公司名称');
        const data = { name, industry: document.getElementById('m-c-industry').value.trim(), scale: document.getElementById('m-c-scale').value, website: document.getElementById('m-c-website').value.trim(), notes: document.getElementById('m-c-notes').value.trim() };
        if (id) DataStore.updateCompany(id, data);
        else DataStore.addCompany(data);
        this.data = DataStore.get();
        this.closeModal();
        this.render();
        this.backgroundSync();
    },

    deleteCompany() {
        const id = document.getElementById('m-company-id').value;
        if (!id || !confirm('删除公司将同时删除其下所有岗位、面试和活动记录，确定？')) return;
        const positionIds = this.data.positions.filter(p => p.companyId === id).map(p => p.id);
        this.data.companies = this.data.companies.filter(c => c.id !== id);
        this.data.positions = this.data.positions.filter(p => p.companyId !== id);
        this.data.interviews = this.data.interviews.filter(i => !positionIds.includes(i.positionId));
        this.data.activities = this.data.activities.filter(a => !positionIds.includes(a.positionId));
        DataStore.set(this.data);
        this.data = DataStore.get();
        this.closeModal();
        this.render();
        this.backgroundSync();
    },

    savePosition() {
        const id = document.getElementById('m-pos-id').value;
        const title = document.getElementById('m-pos-title').value.trim();
        const companyId = document.getElementById('m-pos-company').value;
        if (!title || !companyId) return alert('请填写岗位名称并选择公司');
        const data = { title, companyId, status: document.getElementById('m-pos-status').value, priority: parseInt(document.getElementById('m-pos-priority').value) || 3, location: document.getElementById('m-pos-location').value.trim(), salary: document.getElementById('m-pos-salary').value.trim(), resumeId: document.getElementById('m-pos-resume').value, jd: document.getElementById('m-pos-jd').value.trim(), deadline: document.getElementById('m-pos-deadline').value };
        if (id) DataStore.updatePosition(id, data);
        else DataStore.addPosition(data);
        this.data = DataStore.get();
        this.closeModal();
        this.render();
        this.backgroundSync();
    },

    deletePosition() {
        const id = document.getElementById('m-pos-id').value;
        if (!id || !confirm('确定删除此岗位？')) return;
        DataStore.deletePosition(id);
        this.data = DataStore.get();
        this.closeModal();
        this.render();
        this.backgroundSync();
    },

    saveResume() {
        const id = document.getElementById('m-res-id').value;
        const name = document.getElementById('m-res-name').value.trim();
        if (!name) return alert('请输入资料名称');
        const data = { name, type: document.getElementById('m-res-type').value, target: document.getElementById('m-res-target').value.trim(), version: document.getElementById('m-res-version').value.trim(), content: document.getElementById('m-res-content').value.trim(), fileName: document.getElementById('m-res-file').value.trim() };
        if (id) DataStore.updateResume(id, data);
        else DataStore.addResume(data);
        this.data = DataStore.get();
        this.closeModal();
        this.render();
        this.backgroundSync();
    },

    deleteResume() {
        const id = document.getElementById('m-res-id').value;
        if (!id || !confirm('确定删除？')) return;
        DataStore.deleteResume(id);
        this.data = DataStore.get();
        this.closeModal();
        this.render();
        this.backgroundSync();
    },

    saveInterview() {
        const id = document.getElementById('m-iv-id').value;
        const posId = document.getElementById('m-iv-pos').value;
        const data = { positionId: posId, round: document.getElementById('m-iv-round').value, date: document.getElementById('m-iv-date').value, interviewer: document.getElementById('m-iv-interviewer').value.trim(), selfRating: parseInt(document.getElementById('m-iv-rating').value), result: document.getElementById('m-iv-result').value, questions: document.getElementById('m-iv-questions').value.trim(), notes: document.getElementById('m-iv-notes').value.trim(), mood: document.getElementById('m-iv-mood').value };
        if (id) DataStore.updateInterview(id, data);
        else DataStore.addInterview(data);
        this.data = DataStore.get();
        this.closeModal();
        this.render();
        this.backgroundSync();
        if (!document.getElementById('detail-backdrop').classList.contains('hidden')) {
            this.openDetail(posId);
        }
    },

    deleteInterview() {
        const id = document.getElementById('m-iv-id').value;
        const posId = document.getElementById('m-iv-pos').value;
        if (!id || !confirm('确定删除此面试记录？')) return;
        DataStore.deleteInterview(id);
        this.data = DataStore.get();
        this.closeModal();
        this.render();
        this.backgroundSync();
        if (!document.getElementById('detail-backdrop').classList.contains('hidden')) {
            this.openDetail(posId);
        }
    },

    openPositionModal(positionId = null, companyId = '') {
        if (!positionId && this.data.companies.length === 0) {
            alert('请先添加公司，再添加岗位。');
            this.openModal('company');
            return;
        }
        this.openModal('position', positionId, companyId);
    },

    openInterviewModal(positionId, interviewId = null) {
        this.openModal('interview', positionId, interviewId);
    },

    editResume(id) {
        this.openModal('resume', id);
    },

    openDetail(positionId) {
        const p = this.data.positions.find(x => x.id === positionId);
        if (!p) return;
        this.currentDetail = p;
        const c = this.getCompany(p.companyId);
        const r = this.data.resumes.find(x => x.id === p.resumeId);
        const ivs = this.data.interviews.filter(i => i.positionId === p.id).sort((a,b) => new Date(b.date) - new Date(a.date));
        const acts = this.data.activities.filter(a => a.positionId === p.id).sort((a,b) => new Date(b.date) - new Date(a.date));

        document.getElementById('detail-logo').textContent = (c?.name || '公')[0];
        document.getElementById('detail-title').textContent = p.title;
        document.getElementById('detail-company').textContent = c?.name || '';

        const stars = Array(5).fill(0).map((_,i) => i < p.priority ? '★' : '☆').join('');
        document.getElementById('detail-body').innerHTML = `
            <div class="detail-main">
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
                    <span class="activity-badge badge-${p.status}">${p.status}</span>
                    <span class="activity-badge badge-投递">${p.location || '未知地点'}</span>
                    <span class="activity-badge badge-投递">${p.salary || '薪资面议'}</span>
                    <span style="color:#fbbf24;font-size:14px;">${stars}</span>
                </div>
                <div class="panel" style="margin-bottom:20px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                        <h4 style="font-size:14px;font-weight:700;">进度时间线</h4>
                        <button class="card-btn" onclick="app.openInterviewModal('${p.id}')">+ 记面试</button>
                    </div>
                    <div class="timeline">${acts.map(a => `<div class="timeline-item"><div class="timeline-dot"></div><div><span class="timeline-title">${a.type}</span><span class="timeline-date">${a.date}</span>${a.notes ? `<div class="timeline-note">${a.notes}</div>` : ''}</div></div>`).join('') || '<div style="color:#94a3b8;font-size:12px;">暂无记录</div>'}</div>
                </div>
                <div class="panel"><h4 style="font-size:14px;font-weight:700;margin-bottom:8px;">岗位JD</h4><div style="font-size:13px;color:#475569;line-height:1.6;white-space:pre-wrap;">${p.jd || '暂无'}</div></div>
            </div>
            <div class="detail-sidebar">
                <div class="panel"><h4 style="font-size:14px;font-weight:700;margin-bottom:12px;">公司信息</h4><div style="font-size:13px;color:#475569;"><div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>行业</span><span>${c?.industry||'-'}</span></div><div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>规模</span><span>${c?.scale||'-'}</span></div><div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>官网</span><a href="${c?.website||'#'}" target="_blank" style="color:#3b82f6;">${c?.website?'链接':'-'}</a></div>${c?.notes ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;">${c.notes}</div>` : ''}</div></div>
                <div class="panel"><h4 style="font-size:14px;font-weight:700;margin-bottom:12px;">关联资料</h4>${r ? `<div style="display:flex;align-items:center;gap:8px;padding:8px;background:#f8fafc;border-radius:6px;"><span style="font-size:20px;">📄</span><div><div style="font-size:13px;font-weight:600;">${r.name}</div><div style="font-size:11px;color:#64748b;">${r.version||''}</div></div></div>` : '<div style="font-size:13px;color:#94a3b8;">未关联</div>'}</div>
                <div class="panel"><h4 style="font-size:14px;font-weight:700;margin-bottom:12px;">面试记录</h4>${ivs.map(i => `<div class="interview-card" onclick="app.openInterviewModal('${p.id}', '${i.id}')"><div class="interview-header"><span class="interview-round">${i.round}</span><span class="interview-result ${i.result==='通过'?'pass':i.result==='挂'?'fail':'pending'}">${i.result}</span></div><div class="interview-meta">${i.date} · ${i.interviewer||'未知'}</div><div class="interview-tags"><span class="tag tag-mood">${i.mood}</span><span class="tag tag-rating">${i.selfRating}星</span></div></div>`).join('') || '<div style="font-size:13px;color:#94a3b8;">暂无记录</div>'}</div>
            </div>
        `;
        document.getElementById('detail-backdrop').classList.remove('hidden');
    },

    closeDetail() {
        document.getElementById('detail-backdrop').classList.add('hidden');
        this.currentDetail = null;
    },

    openPrepSheet() {
        if (!this.currentDetail) return;
        const p = this.currentDetail;
        const c = this.getCompany(p.companyId);
        const r = this.data.resumes.find(x => x.id === p.resumeId);
        const ivs = this.data.interviews.filter(i => i.positionId === p.id).sort((a,b) => new Date(b.date) - new Date(a.date));
        const questions = ivs.flatMap(i => (i.questions||'').split('\n').filter(q=>q.trim())).slice(0, 10);

        const win = window.open('', '_blank');
        win.document.write(`<html><head><title>面试准备包 - ${c?.name} ${p.title}</title><style>body{font-family:-apple-system,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#1e293b;line-height:1.6;}h1{font-size:24px;border-bottom:2px solid #e2e8f0;padding-bottom:12px;}h2{font-size:16px;color:#3b82f6;margin-top:24px;}.box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:12px 0;font-size:14px;}.box strong{color:#0f172a;}ul{margin:8px 0;padding-left:20px;}li{margin:4px 0;}.print-btn{position:fixed;top:20px;right:20px;padding:8px 16px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;}@media print{.print-btn{display:none;}}</style></head><body><button class="print-btn" onclick="window.print()">🖨️ 打印 / 存PDF</button><h1>${c?.name||''} · ${p.title}</h1><p style="color:#64748b;">生成于 ${new Date().toLocaleDateString()}</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;"><div class="box"><strong>公司信息</strong><br>行业：${c?.industry||'-'}<br>规模：${c?.scale||'-'}<br>地点：${p.location||'-'}<br>薪资：${p.salary||'-'}<br>${c?.website?`官网：<a href="${c.website}">${c.website}</a><br>`:''}${c?.notes?`<div style="margin-top:8px;font-size:13px;">${c.notes}</div>`:''}</div><div class="box"><strong>岗位JD</strong><div style="white-space:pre-wrap;">${p.jd||'暂无'}</div></div></div>${r?`<h2>📄 关联资料：${r.name}</h2><div class="box" style="background:#ecfdf5;border-color:#a7f3d0;"><div style="white-space:pre-wrap;font-size:13px;">${r.content||''}</div></div>`:''}${questions.length?`<h2>📝 历史高频问题</h2><div class="box"><ul>${questions.map(q=>`<li>${q}</li>`).join('')}</ul></div>`:''}${ivs.length?`<h2>💡 往期复盘</h2>${ivs.slice(0,2).map(i=>`<div class="box" style="background:#fdf2f8;border-color:#fbcfe8;"><strong>${i.round} · ${i.date} · ${i.mood} · ${i.selfRating}星</strong><div style="white-space:pre-wrap;margin-top:8px;font-size:13px;">${i.notes||'无笔记'}</div></div>`).join('')}`:''}<h2>✏️ 临时笔记区</h2><div class="box" style="min-height:100px;border-style:dashed;">（此处可手写补充昨晚突击的知识点...）</div></body></html>`);
        win.document.close();
    },

    getCompany(id) {
        return this.data.companies.find(c => c.id === id);
    }
};

document.addEventListener('DOMContentLoaded', () => app.init());