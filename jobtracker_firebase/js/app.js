const app = {
    data: null,
    currentView: 'dashboard',
    currentDetail: null,
    resumeFilter: 'all',
    expandedCompanyId: null,

    init() {
        this.data = DataStore.get();
        if (!this.data.config) this.data.config = { token: '', gistId: '' };
        this.bindTabs();
        this.render();
        this.updateSyncBadge();

        window.addEventListener('firebase-ready', () => {
            this.renderSettings();
            this.updateSyncBadge();
        });
        window.addEventListener('firebase-auth-changed', () => {
            this.renderSettings();
            this.updateSyncBadge();
        });
    },

    bindTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.switchView(btn.dataset.view);
            });
        });
        document.getElementById('sync-btn').addEventListener('click', () => this.uploadFirebase());

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
        this.expandedCompanyId = null;  // 重置展开状态
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

    escapeHTML(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[ch]));
    },

    escapeJSString(value) {
        return String(value ?? '')
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\r/g, '\\r')
            .replace(/\n/g, '\\n')
            .replace(/</g, '\\x3C');
    },

    inlineArg(value) {
        return this.escapeHTML(this.escapeJSString(value));
    },

    safeBadgeClass(value) {
        const allowed = new Set(['未投递', '投递', '笔试', '一面', '二面', '三面', 'HR面', 'Offer', '拒绝', '接受']);
        return allowed.has(value) ? value : '未投递';
    },

    safeURL(value) {
        const url = String(value || '').trim();
        if (!url) return '#';
        try {
            const parsed = new URL(url, window.location.href);
            return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '#';
        } catch (e) {
            return '#';
        }
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
        const stages = ['未投递', '投递', '笔试', '一面', '二面', '三面', 'HR面', 'Offer'];
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
                    <div class="reminder-text"><div>${this.escapeHTML(r.text)}</div><div class="reminder-date">${this.escapeHTML(r.date)}</div></div>
                </div>`).join('');

        // Activities
        const acts = [...this.data.activities].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
        document.getElementById('recent-activities').innerHTML = acts.map(a => {
            const p = this.data.positions.find(x => x.id === a.positionId);
            const c = p ? this.getCompany(p.companyId) : null;
            const badgeClass = this.safeBadgeClass(a.type);
            return `<div class="activity-item">
                <div class="activity-date">${this.escapeHTML(a.date)}</div>
                <span class="activity-badge badge-${badgeClass}">${this.escapeHTML(a.type)}</span>
                <div class="activity-content">${this.escapeHTML(c?.name || '')} · ${this.escapeHTML(p?.title || '')}</div>
                ${a.notes ? `<div class="activity-note">${this.escapeHTML(a.notes)}</div>` : ''}
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
                    const companyId = this.inlineArg(c.id);
                    return `<div class="company-card">
                        <div class="company-card-header">
                            <div class="card-logo">${this.escapeHTML((c.name || '公')[0])}</div>
                            <div>
                                <div class="company-card-name">${this.escapeHTML(c.name || '未命名公司')}</div>
                                <div class="company-card-meta">${this.escapeHTML(c.industry || '未知行业')} · ${this.escapeHTML(c.scale || '未知规模')} · ${count} 个岗位</div>
                            </div>
                        </div>
                        ${c.notes ? `<div class="company-card-meta">${this.escapeHTML(c.notes)}</div>` : ''}
                        <div class="company-card-actions">
                            <button class="card-btn" onclick="app.openPositionModal(null, '${companyId}')">添加岗位</button>
                            <button class="card-btn" onclick="app.openModal('company', '${companyId}')">编辑公司</button>
                        </div>
                    </div>`;
                }).join('')}
            </div>`;
    },

    renderPositions() {
        const search = document.getElementById('pos-search').value.toLowerCase();
        const status = document.getElementById('pos-status').value;
        const priority = document.getElementById('pos-priority').value;

        // 过滤公司
        let companies = this.data.companies;
        if (search) {
            companies = companies.filter(c => (c.name + c.industry + c.scale + c.notes).toLowerCase().includes(search));
        }

        // 生成公司及其岗位的HTML
        let html = '';
        if (companies.length === 0 && this.data.companies.length === 0) {
            html = '<div class="company-empty" style="grid-column:1/-1;">还没有公司。请先点击右上角"添加公司"，保存后这里会显示公司卡片。</div>';
        } else if (companies.length === 0) {
            html = '<div style="grid-column:1/-1;text-align:center;color:#94a3b8;padding:20px;">没有符合条件的公司</div>';
        } else {
            html = companies.map(c => {
                const isExpanded = this.expandedCompanyId === c.id;
                const jobCount = this.data.positions.filter(p => p.companyId === c.id).length;
                const companyId = this.inlineArg(c.id);
                
                // 过滤该公司的岗位
                let companyJobs = this.data.positions.filter(p => p.companyId === c.id);
                if (search) {
                    companyJobs = companyJobs.filter(p => {
                        const haystack = `${p.title || ''}${p.location || ''}`.toLowerCase();
                        return haystack.includes(search);
                    });
                }
                if (status) {
                    companyJobs = companyJobs.filter(p => p.status === status);
                }
                if (priority) {
                    companyJobs = companyJobs.filter(p => p.priority === parseInt(priority));
                }
                companyJobs.sort((a, b) => b.priority - a.priority || new Date(b.updatedAt) - new Date(a.updatedAt));
                
                // 渲染岗位卡片
                const jobsHtml = companyJobs.map(p => {
                    const r = this.data.resumes.find(x => x.id === p.resumeId);
                    const ivs = this.data.interviews.filter(i => i.positionId === p.id).sort((a,b) => new Date(b.date) - new Date(a.date));
                    const last = ivs[0];
                    const stars = Array(5).fill(0).map((_,i) => `<span class="card-star ${i < p.priority ? 'active' : ''}">★</span>`).join('');
                    const positionId = this.inlineArg(p.id);
                    const badgeClass = this.safeBadgeClass(p.status);
                    return `<div class="card" onclick="app.openDetail('${positionId}')">
                        <div class="card-header">
                            <div class="card-title">
                                <div class="card-logo">${this.escapeHTML((c?.name || '公')[0])}</div>
                                <div><div class="card-name">${this.escapeHTML(c?.name || '未知')}</div><div class="card-role">${this.escapeHTML(p.title)}</div></div>
                            </div>
                            <span class="activity-badge badge-${badgeClass}">${this.escapeHTML(p.status)}</span>
                        </div>
                        <div class="card-stars">${stars}</div>
                        <div class="card-meta"><span>📍 ${this.escapeHTML(p.location || '未知')}</span><span>💰 ${this.escapeHTML(p.salary || '面议')}</span></div>
                        ${r ? `<div class="card-resume">📄 ${this.escapeHTML(r.name)}</div>` : ''}
                        <div class="card-footer">
                            <span class="card-footer-text">${last ? `最近: ${this.escapeHTML(last.round)} ${this.escapeHTML(last.date)}` : '暂无面试'}</span>
                            <div class="card-actions">
                                <button class="card-btn" onclick="event.stopPropagation();app.openPositionModal('${positionId}')">编辑</button>
                                <button class="card-btn" onclick="event.stopPropagation();app.advance('${positionId}')">推进 ➜</button>
                                <button class="card-btn" onclick="event.stopPropagation();app.openInterviewModal('${positionId}')">记面试</button>
                            </div>
                        </div>
                    </div>`;
                }).join('') || '<div style="padding:20px;text-align:center;color:#94a3b8;font-size:13px;">暂无岗位，点击添加岗位创建第一个岗位</div>';
                
                return `<div class="company-card" style="grid-column:1/-1;cursor:pointer;" onclick="app.toggleCompanyJobs('${companyId}')">
                    <div class="company-card-header">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span style="font-size:14px;color:#64748b;transition:transform 0.2s;">${isExpanded ? '▼' : '▶'}</span>
                            <div class="card-logo">${this.escapeHTML((c.name || '公')[0])}</div>
                            <div>
                                <div class="company-card-name">${this.escapeHTML(c.name || '未命名公司')}</div>
                                <div class="company-card-meta">${this.escapeHTML(c.industry || '未知行业')} · ${this.escapeHTML(c.scale || '未知规模')} · ${jobCount} 个岗位</div>
                            </div>
                        </div>
                    </div>
                    ${c.notes ? `<div class="company-card-meta">${this.escapeHTML(c.notes)}</div>` : ''}
                    <div class="company-card-actions">
                        <button class="card-btn" onclick="event.stopPropagation();app.openPositionModal(null, '${companyId}')">添加岗位</button>
                        <button class="card-btn" onclick="event.stopPropagation();app.openModal('company', '${companyId}')">编辑公司</button>
                    </div>
                    ${isExpanded ? `<div style="margin-top:16px;padding-top:16px;border-top:1px solid #e2e8f0;">
                        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;">${jobsHtml}</div>
                    </div>` : ''}
                </div>`;
            }).join('');
        }
        
        document.getElementById('positions-grid').innerHTML = html;
    },

    toggleCompanyJobs(companyId) {
        if (this.expandedCompanyId === companyId) {
            this.expandedCompanyId = null;
        } else {
            this.expandedCompanyId = companyId;
        }
        this.renderPositions();
    },

    advance(id) {
        const p = this.data.positions.find(x => x.id === id);
        const flow = ['未投递', '投递', '笔试', '一面', '二面', '三面', 'HR面', 'Offer'];
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
            const resumeId = this.inlineArg(r.id);
            const fileDownloadBtn = r.fileData ? `<button class="card-btn" onclick="app.downloadFile('${resumeId}', '${this.escapeJSString(r.fileName || '文件')}')">⬇️ 下载</button>` : '';
            const filePreviewBtn = r.fileData ? `<button class="card-btn" onclick="app.previewFile('${resumeId}')">👁️ 预览</button>` : '';
            return `<div class="resume-card">
                <div class="resume-header">
                    <div style="display:flex;gap:10px;align-items:center;">
                        <div class="resume-icon ${r.type === 'resume' ? 'pdf' : r.type === 'intro' ? 'mic' : r.type === 'cover' ? 'mail' : 'file'}">${icons[r.type] || icons.other}</div>
                        <div><div class="resume-name">${this.escapeHTML(r.name)}</div><div class="resume-type">${r.type === 'resume' ? '简历' : r.type === 'intro' ? '自我介绍' : r.type === 'cover' ? '求职信' : '其他'} · ${this.escapeHTML(r.target || '通用')}</div></div>
                    </div>
                    <button class="btn-icon" onclick="app.editResume('${resumeId}')">✏️</button>
                </div>
                ${r.version ? `<div class="resume-version">${this.escapeHTML(r.version)}</div>` : ''}
                <div class="resume-content">${this.escapeHTML(r.content || '无内容')}</div>
                <div class="resume-footer"><span>${linked} 个岗位关联</span>${r.fileName ? `<span>📎 ${this.escapeHTML(r.fileName)}</span>` : ''}</div>
                <div style="display:flex;gap:6px;">${filePreviewBtn}${fileDownloadBtn}</div>
            </div>`;
        }).join('') || '<div style="grid-column:1/-1;text-align:center;color:#94a3b8;padding:40px;">暂无资料</div>';

        document.querySelectorAll('.sidebar-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.cat === this.resumeFilter);
        });
    },

    previewFile(resumeId) {
        const resume = this.data.resumes.find(r => r.id === resumeId);
        if (!resume || !resume.fileData) {
            alert('文件不存在或已损坏');
            return;
        }

        const fileName = resume.fileName || '文件';
        const ext = fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase();
        
        // 支持直接预览的文件类型
        if (['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
            const win = window.open();
            win.document.write(`
                <html>
                <head>
                    <title>${this.escapeHTML(fileName)}</title>
                    <style>
                        body { margin: 0; padding: 0; background: #f0f0f0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
                        img { max-width: 100%; max-height: 100vh; }
                        embed { width: 100%; height: 100vh; }
                    </style>
                </head>
                <body>
            `);
            
            if (ext === 'pdf') {
                win.document.write(`<embed src="${resume.fileData}" type="application/pdf" /></body></html>`);
            } else {
                win.document.write(`<img src="${resume.fileData}" /></body></html>`);
            }
            win.document.close();
            return;
        }
        
        // 其他文件类型无法预览，提示用户下载
        alert(`不支持在线预览 ${ext.toUpperCase()} 文件，请下载后使用相应软件打开`);
    },

    downloadFile(resumeId, fileName) {
        const resume = this.data.resumes.find(r => r.id === resumeId);
        if (!resume || !resume.fileData) {
            alert('文件不存在或已损坏');
            return;
        }
        
        const link = document.createElement('a');
        link.href = resume.fileData;
        link.download = fileName;
        link.click();
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
            return `<div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><span class="font-medium">${this.escapeHTML(t)}</span><span style="font-size:12px;color:#64748b;">${s.total} 投递</span></div><div style="display:flex;gap:16px;font-size:12px;"><div>面试率 <strong style="color:#3b82f6;">${ivRate}%</strong></div><div>Offer率 <strong style="color:#10b981;">${ofRate}%</strong></div></div></div>`;
        }).join('');

        // 招聘漏斗：按阶段统计
        const stages = ['未投递', '投递', '笔试', '一面', '二面', '三面', 'HR面', 'Offer', '接受'];
        const stageCount = {};
        stages.forEach(s => stageCount[s] = 0);
        this.data.positions.forEach(p => {
            const stage = stages.includes(p.status) ? p.status : '未投递';
            for (let i = stages.indexOf(stage); i < stages.length; i++) {
                stageCount[stages[i]]++;
            }
        });
        const funnelHtml = stages.slice(0, -1).map((s, i) => {
            const count = stageCount[s];
            const nextCount = i+1 < stages.length ? stageCount[stages[i+1]] : 0;
            const rate = count ? Math.round(nextCount/count*100) : 0;
            return `<div style="margin-bottom:8px;"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;"><span>${this.escapeHTML(s)}</span><span><strong>${count}</strong> / <strong style="color:#64748b;">通过率 ${rate}%</strong></span></div><div style="height:4px;background:#e2e8f0;border-radius:2px;overflow:hidden;"><div style="width:${count>0?Math.round(nextCount/Math.max(...Object.values(stageCount))*100):0}%;height:100%;background:linear-gradient(to right, #3b82f6, #1e40af);border-radius:2px;"></div></div></div>`;
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
        const resumeHtml = Object.entries(resumeMap).map(([n, s]) => `<div class="panel"><div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span class="font-medium">${this.escapeHTML(n)}</span><span style="font-size:12px;color:#64748b;">${s.total} 场面试</span></div><div style="font-size:12px;">通过率 <strong style="color:${s.rate>=60?'#10b981':s.rate>=40?'#3b82f6':'#f59e0b'};">${s.rate}%</strong></div></div>`).join('');

        const words = {};
        this.data.interviews.forEach(i => {
            if (i.questions) {
                ['Redis','MySQL','Kafka','Docker','K8s','算法','网络','OS','Go','Java','微服务','分布式','设计模式','并发'].forEach(k => {
                    if (i.questions.includes(k)) words[k] = (words[k]||0)+1;
                });
            }
        });
        const wordHtml = Object.entries(words).sort((a,b) => b[1]-a[1]).map(([w,c]) => `<span class="tag" style="background:${c>=3?'#fee2e2':c>=2?'#fef3c7':'#f1f5f9'};color:${c>=3?'#991b1b':c>=2?'#92400e':'#475569'};">${this.escapeHTML(w)} (${c})</span>`).join('') || '<span style="color:#94a3b8;">多记录面试问题即可生成</span>';

        const moods = {};
        this.data.interviews.forEach(i => { moods[i.mood||'一般'] = (moods[i.mood||'一般']||0)+1; });
        const totalMood = Object.values(moods).reduce((a,b)=>a+b,0);
        const moodColors = { '紧张':'#f59e0b', '平稳':'#3b82f6', '超水平发挥':'#10b981', '被问懵':'#ef4444', '一般':'#94a3b8' };
        const moodHtml = Object.entries(moods).map(([m,c]) => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><span style="width:60px;font-size:12px;">${this.escapeHTML(m)}</span><div style="flex:1;height:6px;background:#f1f5f9;border-radius:3px;overflow:hidden;"><div style="width:${totalMood?Math.round(c/totalMood*100):0}%;height:100%;background:${moodColors[m]||'#94a3b8'};border-radius:3px;"></div></div><span style="width:24px;text-align:right;font-size:12px;">${c}</span></div>`).join('');

        document.getElementById('analytics-grid').innerHTML = `
            <div class="panel" style="grid-column:1/-1;"><h3 style="font-size:14px;font-weight:700;margin-bottom:16px;">招聘漏斗</h3>${funnelHtml || '<div style="color:#94a3b8;">数据不足</div>'}</div>
            <div class="panel"><h3 style="font-size:14px;font-weight:700;margin-bottom:16px;">岗位类型表现</h3>${typeHtml || '<div style="color:#94a3b8;">数据不足</div>'}</div>
            <div class="panel"><h3 style="font-size:14px;font-weight:700;margin-bottom:16px;">简历版本效果</h3>${resumeHtml || '<div style="color:#94a3b8;">数据不足</div>'}</div>
            <div class="panel" style="grid-column:1/-1;"><h3 style="font-size:14px;font-weight:700;margin-bottom:16px;">面试知识盲区</h3><div style="display:flex;flex-wrap:wrap;gap:6px;">${wordHtml}</div></div>
            <div class="panel"><h3 style="font-size:14px;font-weight:700;margin-bottom:16px;">面试情绪分布</h3>${moodHtml || '<div style="color:#94a3b8;">暂无数据</div>'}</div>
        `;
    },

    renderSettings() {
        const status = document.getElementById('firebase-status');
        if (!status) return;

        if (!window.FirebaseStore) {
            status.textContent = 'Firebase SDK 还没有加载完成。请确认当前设备可以访问 Firebase，并优先使用本地服务器打开页面。';
            this.updateSyncBadge();
            return;
        }

        const user = window.FirebaseStore.getUser();
        if (user) {
            status.textContent = `已登录：${user.email || '未知账号'}。可以上传或拉取云端数据。`;
        } else {
            status.textContent = '未登录。请先点击“Google 登录”，再进行上传或拉取。';
        }
        this.updateSyncBadge();
    },

    async firebaseLogin() {
        if (!window.FirebaseStore) {
            alert('Firebase SDK 还没有加载完成。请检查网络，或使用本地服务器方式打开页面。');
            return;
        }

        try {
            await window.FirebaseStore.signIn();
            this.renderSettings();
            this.updateSyncBadge();
            alert('登录成功');
        } catch (e) {
            alert('登录失败：' + this.explainFirebaseError(e));
        }
    },

    async firebaseLogout() {
        if (!window.FirebaseStore) return;
        try {
            await window.FirebaseStore.signOut();
            this.renderSettings();
            this.updateSyncBadge();
            alert('已退出登录');
        } catch (e) {
            alert('退出失败：' + this.explainFirebaseError(e));
        }
    },

    async uploadFirebase() {
        if (!window.FirebaseStore) {
            this.switchView('settings');
            alert('Firebase SDK 还没有加载完成。请检查网络，或使用本地服务器方式打开页面。');
            return;
        }

        if (!window.FirebaseStore.getUser()) {
            this.switchView('settings');
            alert('请先在设置页点击“Google 登录”。');
            return;
        }

        try {
            this.data = DataStore.get();
            await window.FirebaseStore.upload(DataStore.normalize(this.data));
            this.updateSyncBadge();
            alert('已上传到 Firebase 云端');
        } catch (e) {
            alert('上传失败：' + this.explainFirebaseError(e));
        }
    },

    async downloadFirebase() {
        if (!window.FirebaseStore) {
            alert('Firebase SDK 还没有加载完成。请检查网络，或使用本地服务器方式打开页面。');
            return;
        }

        if (!window.FirebaseStore.getUser()) {
            alert('请先点击“Google 登录”。');
            return;
        }

        try {
            const remote = await window.FirebaseStore.download();
            if (!remote) {
                alert('云端还没有数据。请先在有数据的设备上点击“上传到云端”。');
                return;
            }

            if (confirm('从云端拉取会覆盖当前浏览器里的本地数据，确定继续吗？')) {
                const data = DataStore.normalize(remote);
                data.config = { token: '', gistId: '' };
                DataStore.set(data);
                this.data = DataStore.get();
                this.render();
                this.updateSyncBadge();
                alert('已从 Firebase 云端拉取数据');
            }
        } catch (e) {
            alert('拉取失败：' + this.explainFirebaseError(e));
        }
    },

    saveSyncConfig() {
        alert('当前版本使用 Firebase 云同步，不再使用 GitHub Gist。');
    },

    manualSync() {
        this.uploadFirebase();
    },

    backgroundSync() {
        this.updateSyncBadge();
    },

    disconnectSync() {
        this.firebaseLogout();
    },

    updateSyncBadge() {
        const badge = document.getElementById('sync-status');
        const user = window.FirebaseStore?.getUser?.();
        if (user) {
            badge.textContent = 'Firebase';
            badge.classList.add('synced');
        } else {
            badge.textContent = '本地保存';
            badge.classList.remove('synced');
        }
    },

    explainFirebaseError(error) {
        const code = error?.code || '';
        const message = error?.message || String(error);

        if (code.includes('auth/unauthorized-domain')) {
            return '当前网址没有加入 Firebase Authentication 的授权域名。请在 Firebase 控制台的 Authentication → Settings → Authorized domains 中加入当前域名。';
        }
        if (code.includes('auth/popup-blocked')) {
            return '浏览器拦截了登录弹窗。请允许弹窗后重试。';
        }
        if (code.includes('auth/popup-closed-by-user')) {
            return '登录弹窗被关闭了。请重新点击 Google 登录。';
        }
        if (code.includes('permission-denied')) {
            return 'Firestore 权限规则拒绝了本次读写。请检查规则是否允许 users/{uid}/jobtracker/main 路径。';
        }
        if (message.includes('Failed to fetch') || message.includes('network')) {
            return '网络无法连接 Firebase。请检查网络或代理。';
        }
        return message;
    },

    exportJSON() {
        const exportData = DataStore.normalize(this.data);
        exportData.config = { token: '', gistId: '' };
        // 导出时剥离文件数据，减小导出文件大小
        exportData.resumes = exportData.resumes.map(r => {
            const { fileData, ...rest } = r;
            return rest;
        });
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `jobtracker_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
    },

    importJSON(input) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const data = DataStore.normalize(JSON.parse(e.target.result));
                data.config = { token: '', gistId: '' };
                if (confirm('导入会覆盖当前浏览器里的数据，确定继续吗？')) {
                    DataStore.set(data);
                    this.data = DataStore.get();
                    this.render();
                    alert('导入成功');
                }
            } catch (err) {
                alert('文件格式错误：请选择本项目导出的 JSON 备份文件');
            }
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
        // 如果详情页打开了，先关闭它
        const detailBackdrop = document.getElementById('detail-backdrop');
        if (detailBackdrop && !detailBackdrop.classList.contains('hidden')) {
            this.closeDetail();
        }

        const backdrop = document.getElementById('modal-backdrop');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');
        const footer = document.getElementById('modal-footer');
        backdrop.classList.remove('hidden');

        if (type === 'company') {
            title.textContent = id ? '编辑公司' : '添加公司';
            const c = id ? this.data.companies.find(x => x.id === id) : {};
            body.innerHTML = `<input type="hidden" id="m-company-id" value="${this.escapeHTML(id || '')}">
                <div class="form-group"><label>公司名称 *</label><input id="m-c-name" value="${this.escapeHTML(c.name || '')}"></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group"><label>行业</label><input id="m-c-industry" value="${this.escapeHTML(c.industry || '')}"></div>
                    <div class="form-group"><label>规模</label><select id="m-c-scale"><option value="">未知</option>${['初创','成长型','大厂','外企','国企'].map(s => `<option value="${s}" ${c.scale===s?'selected':''}>${s}</option>`).join('')}</select></div>
                </div>
                <div class="form-group"><label>官网</label><input id="m-c-website" value="${this.escapeHTML(c.website || '')}"></div>
                <div class="form-group"><label>备注</label><textarea id="m-c-notes" rows="3">${this.escapeHTML(c.notes || '')}</textarea></div>`;
            footer.innerHTML = `${id?'<button class="btn-danger" data-action="deleteCompany">删除</button>':''}<div style="margin-left:auto;display:flex;gap:8px;"><button class="btn-secondary" data-action="closeModal">取消</button><button class="btn-primary" data-action="saveCompany">保存</button></div>`;
        } else if (type === 'position') {
            const p = id ? (this.data.positions.find(x => x.id === id) || {}) : {};
            const isEdit = !!p.id;
            title.textContent = isEdit ? '编辑岗位' : '添加岗位';
            const companyId = p.companyId || presetCompanyId || this.data.companies[0]?.id || '';
            body.innerHTML = `<input type="hidden" id="m-pos-id" value="${this.escapeHTML(isEdit ? p.id : '')}">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group"><label>岗位名称 *</label><input id="m-pos-title" value="${this.escapeHTML(p.title || '')}"></div>
                    <div class="form-group"><label>所属公司</label><select id="m-pos-company">${this.data.companies.map(c => `<option value="${this.escapeHTML(c.id)}" ${companyId===c.id?'selected':''}>${this.escapeHTML(c.name)}</option>`).join('')}</select></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group"><label>状态</label><select id="m-pos-status">${['未投递','投递','笔试','一面','二面','三面','HR面','Offer','拒绝','接受'].map(s => `<option value="${s}" ${p.status===s || (!isEdit && s==='未投递')?'selected':''}>${s}</option>`).join('')}</select></div>
                    <div class="form-group"><label>意愿度</label><div class="star-rating" id="m-pos-stars"></div><input type="hidden" id="m-pos-priority" value="${this.escapeHTML(p.priority || 3)}"></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group"><label>地点</label><input id="m-pos-location" value="${this.escapeHTML(p.location || '')}"></div>
                    <div class="form-group"><label>薪资</label><input id="m-pos-salary" value="${this.escapeHTML(p.salary || '')}"></div>
                </div>
                <div class="form-group"><label>关联简历</label><select id="m-pos-resume"><option value="">不关联</option>${this.data.resumes.map(r => `<option value="${this.escapeHTML(r.id)}" ${p.resumeId===r.id?'selected':''}>${this.escapeHTML(r.name)}</option>`).join('')}</select></div>
                <div class="form-group"><label>岗位JD</label><textarea id="m-pos-jd" rows="4">${this.escapeHTML(p.jd || '')}</textarea></div>
                <div class="form-group"><label>Deadline</label><input type="date" id="m-pos-deadline" value="${this.escapeHTML(p.deadline || '')}"></div>`;
            setTimeout(() => this.renderStarInput('m-pos-stars', 'm-pos-priority', p.priority || 3), 0);
            footer.innerHTML = `${isEdit?'<button class="btn-danger" data-action="deletePosition">删除</button>':''}<div style="margin-left:auto;display:flex;gap:8px;"><button class="btn-secondary" data-action="closeModal">取消</button><button class="btn-primary" data-action="savePosition">保存</button></div>`;
        } else if (type === 'resume') {
            title.textContent = id ? '编辑资料' : '添加资料';
            const r = id ? this.data.resumes.find(x => x.id === id) : {};
            const fileStatusDisplay = r.fileData ? `✓ 已有文件: ${this.escapeHTML(r.fileName || '文件')}` : '未上传文件';
            body.innerHTML = `<input type="hidden" id="m-res-id" value="${this.escapeHTML(id || '')}">
                <div class="form-group"><label>资料名称 *</label><input id="m-res-name" value="${this.escapeHTML(r.name || '')}"></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group"><label>类型</label><select id="m-res-type">${['resume','intro','cover','other'].map(t => `<option value="${t}" ${r.type===t?'selected':''}>${t==='resume'?'简历':t==='intro'?'自我介绍':t==='cover'?'求职信':'其他'}</option>`).join('')}</select></div>
                    <div class="form-group"><label>目标岗位</label><input id="m-res-target" value="${this.escapeHTML(r.target || '')}"></div>
                </div>
                <div class="form-group"><label>版本说明</label><input id="m-res-version" value="${this.escapeHTML(r.version || '')}"></div>
                <div class="form-group"><label>内容</label><textarea id="m-res-content" rows="6">${this.escapeHTML(r.content || '')}</textarea></div>
                <div class="form-group">
                    <label>上传文件（PDF、Word、图片等）</label>
                    <input type="file" id="m-res-file-input" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.txt,.xlsx,.xls" onchange="app.handleFileSelect(event)">
                    <div id="file-status" style="font-size:12px;color:#64748b;margin-top:4px;">${fileStatusDisplay}</div>
                </div>
                <input type="hidden" id="m-res-file" value="${this.escapeHTML(r.fileName || '')}">
                <input type="hidden" id="m-res-file-data" value="">`;
            footer.innerHTML = `${id?'<button class="btn-danger" data-action="deleteResume">删除</button>':''}<div style="margin-left:auto;display:flex;gap:8px;"><button class="btn-secondary" data-action="closeModal">取消</button><button class="btn-primary" data-action="saveResume">保存</button></div>`;
        } else if (type === 'interview') {
            const posId = id;
            const ivId = arguments[2] || null;
            const iv = ivId ? this.data.interviews.find(x => x.id === ivId) : {};
            title.textContent = ivId ? '编辑面试' : '记录面试';
            body.innerHTML = `<input type="hidden" id="m-iv-id" value="${this.escapeHTML(ivId || '')}"><input type="hidden" id="m-iv-pos" value="${this.escapeHTML(posId || '')}">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group"><label>轮次</label><select id="m-iv-round">${['笔试','一面','二面','三面','HR面','其他'].map(r => `<option value="${r}" ${iv.round===r?'selected':''}>${r}</option>`).join('')}</select></div>
                    <div class="form-group"><label>日期</label><input type="date" id="m-iv-date" value="${this.escapeHTML(iv.date || new Date().toISOString().split('T')[0])}"></div>
                </div>
                <div class="form-group"><label>面试官</label><input id="m-iv-interviewer" value="${this.escapeHTML(iv.interviewer || '')}"></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group"><label>自我评分</label><input type="range" id="m-iv-rating" min="1" max="5" value="${this.escapeHTML(iv.selfRating || 3)}" oninput="document.getElementById('rating-disp').textContent=this.value+'星'"><span id="rating-disp" style="font-size:12px;color:#3b82f6;font-weight:600;">${this.escapeHTML(iv.selfRating || 3)}星</span></div>
                    <div class="form-group"><label>结果</label><select id="m-iv-result">${['待反馈','通过','挂','待定'].map(r => `<option value="${r}" ${iv.result===r?'selected':''}>${r}</option>`).join('')}</select></div>
                </div>
                <div class="form-group"><label>情绪</label><div style="display:flex;gap:6px;flex-wrap:wrap;">${['紧张','平稳','超水平发挥','被问懵','一般'].map(m => `<button type="button" class="mood-btn ${(iv.mood||'平稳')===m?'active':''}" onclick="app.setMoodBtn(this)" data-mood="${m}">${m}</button>`).join('')}</div><input type="hidden" id="m-iv-mood" value="${this.escapeHTML(iv.mood || '平稳')}"></div>
                <div class="form-group"><label>面试问题（每行一个）</label><textarea id="m-iv-questions" rows="4">${this.escapeHTML(iv.questions || '')}</textarea></div>
                <div class="form-group"><label>复盘笔记</label><textarea id="m-iv-notes" rows="4">${this.escapeHTML(iv.notes || '')}</textarea></div>`;
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
        // 新增岗位时，默认状态为"未投递"；编辑时保持当前状态
        const status = id ? document.getElementById('m-pos-status').value : (document.getElementById('m-pos-status').value || '未投递');
        const data = { title, companyId, status, priority: parseInt(document.getElementById('m-pos-priority').value) || 3, location: document.getElementById('m-pos-location').value.trim(), salary: document.getElementById('m-pos-salary').value.trim(), resumeId: document.getElementById('m-pos-resume').value, jd: document.getElementById('m-pos-jd').value.trim(), deadline: document.getElementById('m-pos-deadline').value };
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
        
        const newFileData = document.getElementById('m-res-file-data').value;
        const existingResume = id ? this.data.resumes.find(r => r.id === id) : null;
        
        const data = { 
            name, 
            type: document.getElementById('m-res-type').value, 
            target: document.getElementById('m-res-target').value.trim(), 
            version: document.getElementById('m-res-version').value.trim(), 
            content: document.getElementById('m-res-content').value.trim(), 
            fileName: document.getElementById('m-res-file').value.trim(),
            // 如果有新文件数据就用新的，否则保留原有的
            fileData: newFileData || (existingResume?.fileData || '')
        };
        
        if (id) DataStore.updateResume(id, data);
        else DataStore.addResume(data);
        this.data = DataStore.get();
        this.closeModal();
        this.render();
        this.backgroundSync();
    },

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const maxSize = 5 * 1024 * 1024; // 5MB限制
        if (file.size > maxSize) {
            alert('文件大小不能超过5MB');
            event.target.value = '';
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const fileData = e.target.result;
            document.getElementById('m-res-file').value = file.name;
            document.getElementById('m-res-file-data').value = fileData;
            document.getElementById('file-status').textContent = `✓ 已选择: ${file.name} (${(file.size / 1024).toFixed(2)}KB)`;
        };
        reader.onerror = () => {
            alert('文件读取失败');
        };
        reader.readAsDataURL(file);
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
        document.getElementById('detail-title').textContent = p.title || '';
        document.getElementById('detail-company').textContent = c?.name || '';

        const stars = Array(5).fill(0).map((_,i) => i < p.priority ? '★' : '☆').join('');
        const safePositionId = this.inlineArg(p.id);
        const website = this.safeURL(c?.website);
        const badgeClass = this.safeBadgeClass(p.status);
        document.getElementById('detail-body').innerHTML = `
            <div class="detail-main">
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
                    <span class="activity-badge badge-${badgeClass}">${this.escapeHTML(p.status)}</span>
                    <span class="activity-badge badge-投递">${this.escapeHTML(p.location || '未知地点')}</span>
                    <span class="activity-badge badge-投递">${this.escapeHTML(p.salary || '薪资面议')}</span>
                    <span style="color:#fbbf24;font-size:14px;">${stars}</span>
                </div>
                <div class="panel" style="margin-bottom:20px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                        <h4 style="font-size:14px;font-weight:700;">进度时间线</h4>
                        <button class="card-btn" onclick="app.openInterviewModal('${safePositionId}')">+ 记面试</button>
                    </div>
                    <div class="timeline">${acts.map(a => `<div class="timeline-item"><div class="timeline-dot"></div><div><span class="timeline-title">${this.escapeHTML(a.type)}</span><span class="timeline-date">${this.escapeHTML(a.date)}</span>${a.notes ? `<div class="timeline-note">${this.escapeHTML(a.notes)}</div>` : ''}</div></div>`).join('') || '<div style="color:#94a3b8;font-size:12px;">暂无记录</div>'}</div>
                </div>
                <div class="panel"><h4 style="font-size:14px;font-weight:700;margin-bottom:8px;">岗位JD</h4><div style="font-size:13px;color:#475569;line-height:1.6;white-space:pre-wrap;">${this.escapeHTML(p.jd || '暂无')}</div></div>
            </div>
            <div class="detail-sidebar">
                <div class="panel"><h4 style="font-size:14px;font-weight:700;margin-bottom:12px;">公司信息</h4><div style="font-size:13px;color:#475569;"><div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>行业</span><span>${this.escapeHTML(c?.industry||'-')}</span></div><div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>规模</span><span>${this.escapeHTML(c?.scale||'-')}</span></div><div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>官网</span><a href="${this.escapeHTML(website)}" target="_blank" rel="noopener noreferrer" style="color:#3b82f6;">${website !== '#' ? '链接' : '-'}</a></div>${c?.notes ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;">${this.escapeHTML(c.notes)}</div>` : ''}</div></div>
                <div class="panel"><h4 style="font-size:14px;font-weight:700;margin-bottom:12px;">关联资料</h4>${r ? `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:#f8fafc;border-radius:6px;"><div style="display:flex;align-items:center;gap:8px;flex:1;"><span style="font-size:20px;">📄</span><div><div style="font-size:13px;font-weight:600;">${this.escapeHTML(r.name)}</div><div style="font-size:11px;color:#64748b;">${this.escapeHTML(r.version||'')}</div></div></div>${r.fileData ? `<div style="display:flex;gap:4px;"><button class="card-btn" onclick="app.previewFile('${this.inlineArg(r.id)}')">👁️</button><button class="card-btn" onclick="app.downloadFile('${this.inlineArg(r.id)}', '${this.escapeJSString(r.fileName || '文件')}')">⬇️</button></div>` : ''}</div>` : '<div style="font-size:13px;color:#94a3b8;">未关联</div>'}</div>
                <div class="panel"><h4 style="font-size:14px;font-weight:700;margin-bottom:12px;">面试记录</h4>${ivs.map(i => `<div class="interview-card" onclick="app.openInterviewModal('${safePositionId}', '${this.inlineArg(i.id)}')"><div class="interview-header"><span class="interview-round">${this.escapeHTML(i.round)}</span><span class="interview-result ${i.result==='通过'?'pass':i.result==='挂'?'fail':'pending'}">${this.escapeHTML(i.result)}</span></div><div class="interview-meta">${this.escapeHTML(i.date)} · ${this.escapeHTML(i.interviewer||'未知')}</div><div class="interview-tags"><span class="tag tag-mood">${this.escapeHTML(i.mood)}</span><span class="tag tag-rating">${this.escapeHTML(i.selfRating)}星</span></div></div>`).join('') || '<div style="font-size:13px;color:#94a3b8;">暂无记录</div>'}</div>
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
        const companyWebsite = this.safeURL(c?.website);
        const safeTitle = `${this.escapeHTML(c?.name || '')} · ${this.escapeHTML(p.title || '')}`;

        const win = window.open('', '_blank');
        win.document.write(`<html><head><title>面试准备包 - ${safeTitle}</title><style>body{font-family:-apple-system,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#1e293b;line-height:1.6;}h1{font-size:24px;border-bottom:2px solid #e2e8f0;padding-bottom:12px;}h2{font-size:16px;color:#3b82f6;margin-top:24px;}.box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:12px 0;font-size:14px;}.box strong{color:#0f172a;}ul{margin:8px 0;padding-left:20px;}li{margin:4px 0;}.print-btn{position:fixed;top:20px;right:20px;padding:8px 16px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;}@media print{.print-btn{display:none;}}</style></head><body><button class="print-btn" onclick="window.print()">🖨️ 打印 / 存PDF</button><h1>${safeTitle}</h1><p style="color:#64748b;">生成于 ${this.escapeHTML(new Date().toLocaleDateString())}</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;"><div class="box"><strong>公司信息</strong><br>行业：${this.escapeHTML(c?.industry||'-')}<br>规模：${this.escapeHTML(c?.scale||'-')}<br>地点：${this.escapeHTML(p.location||'-')}<br>薪资：${this.escapeHTML(p.salary||'-')}<br>${companyWebsite !== '#'?`官网：<a href="${this.escapeHTML(companyWebsite)}" rel="noopener noreferrer">${this.escapeHTML(companyWebsite)}</a><br>`:''}${c?.notes?`<div style="margin-top:8px;font-size:13px;">${this.escapeHTML(c.notes)}</div>`:''}</div><div class="box"><strong>岗位JD</strong><div style="white-space:pre-wrap;">${this.escapeHTML(p.jd||'暂无')}</div></div></div>${r?`<h2>📄 关联资料：${this.escapeHTML(r.name)}</h2><div class="box" style="background:#ecfdf5;border-color:#a7f3d0;"><div style="white-space:pre-wrap;font-size:13px;">${this.escapeHTML(r.content||'')}</div></div>`:''}${questions.length?`<h2>📝 历史高频问题</h2><div class="box"><ul>${questions.map(q=>`<li>${this.escapeHTML(q)}</li>`).join('')}</ul></div>`:''}${ivs.length?`<h2>💡 往期复盘</h2>${ivs.slice(0,2).map(i=>`<div class="box" style="background:#fdf2f8;border-color:#fbcfe8;"><strong>${this.escapeHTML(i.round)} · ${this.escapeHTML(i.date)} · ${this.escapeHTML(i.mood)} · ${this.escapeHTML(i.selfRating)}星</strong><div style="white-space:pre-wrap;margin-top:8px;font-size:13px;">${this.escapeHTML(i.notes||'无笔记')}</div></div>`).join('')}`:''}<h2>✏️ 临时笔记区</h2><div class="box" style="min-height:100px;border-style:dashed;">（此处可手写补充昨晚突击的知识点...）</div></body></html>`);
        win.document.close();
    },

    getCompany(id) {
        return this.data.companies.find(c => c.id === id);
    }
};

document.addEventListener('DOMContentLoaded', () => app.init());
