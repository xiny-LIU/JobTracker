const app = {
    data: null,
    currentView: 'dashboard',
    currentDetail: null,
    resumeFilter: 'all',
    expandedCompanyIds: new Set(),
    renderedCompanyIds: [],
    companySortable: null,
    lastPositionFilterKey: '',
    toastTimer: null,

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
        document.querySelectorAll('.tab-btn, .mobile-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
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
        this.expandedCompanyIds.clear();  // 重置展开状态
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(`view-${view}`).classList.add('active');
        document.querySelectorAll('.tab-btn, .mobile-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });
        this.render();
    },

    showToast(message, type = 'success', duration = 2600) {
        const toast = document.getElementById('global-toast');
        const messageEl = document.getElementById('global-toast-message');
        if (!toast || !messageEl) return;

        messageEl.textContent = message;
        toast.className = `global-toast show ${type}`;
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
            toast.classList.remove('show');
        }, duration);
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

    renderMarkdown(text) {
        const source = String(text || '').replace(/\r\n/g, '\n').trim();
        if (!source) return '<div class="markdown-empty">暂无</div>';

        const renderInline = value => this.escapeHTML(value)
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        const lines = source.split('\n');
        const html = [];
        let paragraph = [];
        let listType = null;

        const flushParagraph = () => {
            if (!paragraph.length) return;
            html.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`);
            paragraph = [];
        };
        const closeList = () => {
            if (!listType) return;
            html.push(`</${listType}>`);
            listType = null;
        };
        const openList = type => {
            if (listType === type) return;
            closeList();
            flushParagraph();
            listType = type;
            html.push(`<${type}>`);
        };

        lines.forEach(rawLine => {
            const line = rawLine.trim();
            if (!line) {
                flushParagraph();
                closeList();
                return;
            }

            const heading = line.match(/^(#{1,3})\s+(.+)$/);
            if (heading) {
                flushParagraph();
                closeList();
                html.push(`<h${heading[1].length}>${renderInline(heading[2])}</h${heading[1].length}>`);
                return;
            }

            const quote = line.match(/^>\s?(.+)$/);
            if (quote) {
                flushParagraph();
                closeList();
                html.push(`<blockquote>${renderInline(quote[1])}</blockquote>`);
                return;
            }

            const unordered = line.match(/^\*\s+(.+)$/);
            if (unordered) {
                openList('ul');
                html.push(`<li>${renderInline(unordered[1])}</li>`);
                return;
            }

            const ordered = line.match(/^\d+\.\s+(.+)$/);
            if (ordered) {
                openList('ol');
                html.push(`<li>${renderInline(ordered[1])}</li>`);
                return;
            }

            closeList();
            paragraph.push(line);
        });

        flushParagraph();
        closeList();
        return `<div class="markdown-body">${html.join('')}</div>`;
    },

    getMarkdownSummary(text, maxLength = 90) {
        const plain = String(text || '')
            .replace(/\r\n/g, '\n')
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/^>\s?/gm, '')
            .replace(/^\s*[-*]\s+/gm, '')
            .replace(/^\s*\d+\.\s+/gm, '')
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/[`*_~]/g, '')
            .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
            .replace(/\s+/g, ' ')
            .trim();
        if (!plain) return '无内容';
        return plain.length > maxLength ? `${plain.slice(0, maxLength)}...` : plain;
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

    getSortedCompanies(companies = this.data.companies) {
        return [...companies]
            .map((company, index) => ({ company, index }))
            .sort((a, b) => {
                const orderA = Number.isFinite(Number(a.company.order)) ? Number(a.company.order) : a.index * 10;
                const orderB = Number.isFinite(Number(b.company.order)) ? Number(b.company.order) : b.index * 10;
                return orderA - orderB || a.index - b.index;
            })
            .map(item => item.company);
    },

    getCompanyJobs(companyId) {
        return this.data.positions.filter(p => p.companyId === companyId);
    },

    getCompanyHighestStatus(company) {
        const statusOrder = ['未投递', '投递', '笔试', '一面', '二面', '三面', 'HR面', 'Offer', '接受'];
        const jobs = this.getCompanyJobs(company.id);
        if (!jobs.length) return '未投递';
        const activeJobs = jobs.filter(p => p.status !== '拒绝');
        if (!activeJobs.length) return '拒绝';
        return activeJobs.reduce((highest, job) => {
            const currentIndex = statusOrder.indexOf(job.status);
            const highestIndex = statusOrder.indexOf(highest);
            return currentIndex > highestIndex ? job.status : highest;
        }, '未投递');
    },

    getCompanyLastUpdated(company) {
        const jobs = this.getCompanyJobs(company.id);
        const jobIds = new Set(jobs.map(p => p.id));
        const candidates = [];

        jobs.forEach(job => {
            if (job.updatedAt) candidates.push(job.updatedAt);
        });
        this.data.interviews.forEach(interview => {
            if (!jobIds.has(interview.positionId)) return;
            if (interview.date) candidates.push(interview.date);
            if (interview.createdAt) candidates.push(interview.createdAt);
        });
        if (company.updatedAt) candidates.push(company.updatedAt);

        const dates = candidates
            .map(value => ({ value, time: new Date(value).getTime() }))
            .filter(item => Number.isFinite(item.time))
            .sort((a, b) => b.time - a.time);

        if (!dates.length) return '暂无更新';
        return new Date(dates[0].time).toLocaleDateString('zh-CN');
    },

    formatJobCount(count) {
        return `${count} 个岗位`;
    },

    getCompanyMetaItems(company) {
        const items = [
            { icon: '🏭', text: company.industry || '未知行业' },
            { icon: '👥', text: company.scale || '未知规模' }
        ];
        if (company.city) items.push({ icon: '📍', text: company.city });
        return items;
    },

    renderCompanyMeta(company) {
        return this.getCompanyMetaItems(company)
            .map(item => `<span class="company-meta-item"><span>${item.icon}</span>${this.escapeHTML(item.text)}</span>`)
            .join('');
    },

    isCompanyOrderingDisabled() {
        const search = document.getElementById('pos-search')?.value.trim();
        const status = document.getElementById('pos-status')?.value;
        const priority = document.getElementById('pos-priority')?.value;
        return Boolean(search || status || priority);
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
        const delivered = this.data.positions.filter(p => p.status !== '未投递').length;
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
        const deliveredEl = document.getElementById('stat-delivered');
        if (deliveredEl) deliveredEl.textContent = delivered;

        // 状态分布
        const stages = ['未投递', '投递', '笔试', '一面', '二面', '三面', 'HR面', 'Offer', '拒绝', '接受'];
        const normStatus = p => stages.includes(p.status) ? p.status : '未投递';
        const counts = stages.map(s => this.data.positions.filter(p => normStatus(p) === s).length);
        const max = Math.max(...counts, 1);
        const colors = ['#94a3b8', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#059669', '#0ea5e9', '#ef4444', '#0f766e'];

        document.getElementById('funnel-container').innerHTML = stages.map((s, i) => {
            const count = counts[i];
            const percent = total ? Math.round((count / total) * 100) : 0;
            return `<div class="funnel-row">
                <div class="funnel-label">${s}</div>
                <div class="funnel-bar-wrap"><div class="funnel-bar" style="width:${(count/max)*100}%;background:${colors[i]}">${count}</div></div>
                <div class="funnel-rate">${percent}%</div>
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
        const acts = [...this.data.activities].sort((a,b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date)).slice(0, 10);
        document.getElementById('recent-activities').innerHTML = acts.map(a => {
            const p = this.data.positions.find(x => x.id === (a.jobId || a.positionId));
            const c = a.companyId ? this.getCompany(a.companyId) : (p ? this.getCompany(p.companyId) : null);
            const badgeClass = this.safeBadgeClass(a.type);
            const activityId = this.inlineArg(a.id);
            return `<div class="activity-item">
                <div class="activity-date">${this.escapeHTML(a.date || String(a.createdAt || '').split('T')[0])}</div>
                <span class="activity-badge badge-${badgeClass}">${this.escapeHTML(a.type)}</span>
                <div class="activity-content">${a.manual ? '<span class="manual-badge">手动</span>' : ''}${this.escapeHTML(a.title || a.type)}${c || p ? ` · ${this.escapeHTML(c?.name || '')} ${this.escapeHTML(p?.title || '')}` : ''}</div>
                ${a.detail || a.notes ? `<div class="activity-note">${this.escapeHTML(a.detail || a.notes)}</div>` : ''}
                <button class="activity-delete-btn" title="删除活动记录" onclick="event.stopPropagation();app.deleteActivity('${activityId}')">删除</button>
            </div>`;
        }).join('') || '<div style="text-align:center;color:#94a3b8;padding:20px;">暂无记录</div>';
    },

    renderCompaniesSection(search = '') {
        const container = document.getElementById('company-section');
        if (!container) return;

        let companies = this.getSortedCompanies();
        if (search) {
            companies = companies.filter(c => (c.name + c.industry + c.scale + c.notes + (c.background || '')).toLowerCase().includes(search));
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
        const isOrderingDisabled = Boolean(search.trim() || status || priority);
        const filterKey = `${search.trim()}|${status}|${priority}`;

        const filterJobs = (jobs, companyMatched = false) => {
            let filtered = [...jobs];
            if (search && !companyMatched) {
                filtered = filtered.filter(p => {
                    const haystack = `${p.title || ''}${p.location || ''}${p.salary || ''}${p.jd || ''}`.toLowerCase();
                    return haystack.includes(search);
                });
            }
            if (status) filtered = filtered.filter(p => p.status === status);
            if (priority) filtered = filtered.filter(p => p.priority === parseInt(priority));
            return filtered.sort((a, b) => (b.priority || 0) - (a.priority || 0) || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
        };

        const companies = this.getSortedCompanies().filter(company => {
            const companyHaystack = `${company.name || ''}${company.industry || ''}${company.scale || ''}${company.city || ''}${company.notes || ''}${company.background || ''}`.toLowerCase();
            const companyMatched = search && companyHaystack.includes(search);
            const jobs = this.getCompanyJobs(company.id);
            const filteredJobs = filterJobs(jobs, companyMatched);
            if (!search && !status && !priority) return true;
            return companyMatched || filteredJobs.length > 0;
        });
        this.renderedCompanyIds = companies.map(c => c.id);
        if (filterKey !== this.lastPositionFilterKey) {
            if (isOrderingDisabled) {
                this.renderedCompanyIds.forEach(id => this.expandedCompanyIds.add(id));
            }
            this.lastPositionFilterKey = filterKey;
        }

        // 生成公司及其岗位的HTML
        let html = '';
        if (companies.length === 0 && this.data.companies.length === 0) {
            html = '<div class="company-empty" style="grid-column:1/-1;">还没有公司。请先点击右上角"添加公司"，保存后这里会显示公司卡片。</div>';
        } else if (companies.length === 0) {
            html = '<div style="grid-column:1/-1;text-align:center;color:#94a3b8;padding:20px;">没有符合条件的公司</div>';
        } else {
            html = companies.map((c, index) => {
                const isExpanded = this.expandedCompanyIds.has(c.id);
                const allCompanyJobs = this.getCompanyJobs(c.id);
                const jobCount = allCompanyJobs.length;
                const companyId = this.inlineArg(c.id);
                const companyDomId = this.escapeHTML(c.id);
                const isFirst = index === 0;
                const isLast = index === companies.length - 1;
                const companyHaystack = `${c.name || ''}${c.industry || ''}${c.scale || ''}${c.city || ''}${c.notes || ''}${c.background || ''}`.toLowerCase();
                const companyMatched = search && companyHaystack.includes(search);
                const companyJobs = filterJobs(allCompanyJobs, companyMatched);
                const highestStatus = this.getCompanyHighestStatus(c);
                const badgeClass = this.safeBadgeClass(highestStatus);
                const lastUpdated = this.getCompanyLastUpdated(c);
                const lastUpdatedText = lastUpdated === '暂无更新' ? lastUpdated : `最近更新：${lastUpdated}`;
                const companyMetaHtml = this.renderCompanyMeta(c);
                const jobCountText = this.formatJobCount(jobCount);
                const dragDisabledClass = isOrderingDisabled ? ' disabled' : '';
                const upDisabled = isOrderingDisabled || isFirst ? 'disabled' : '';
                const downDisabled = isOrderingDisabled || isLast ? 'disabled' : '';
                
                // 渲染岗位卡片
                const jobsHtml = companyJobs.map(p => {
                    const r = this.data.resumes.find(x => x.id === p.resumeId);
                    const ivs = this.data.interviews.filter(i => i.positionId === p.id).sort((a,b) => new Date(b.date) - new Date(a.date));
                    const last = ivs[0];
                    const stars = Array(5).fill(0).map((_,i) => `<span class="card-star ${i < p.priority ? 'active' : ''}">★</span>`).join('');
                    const positionId = this.inlineArg(p.id);
                    const positionBadgeClass = this.safeBadgeClass(p.status);
                    return `<div class="card position-card" onclick="event.stopPropagation();app.openDetail('${positionId}')">
                        <div class="card-header position-card-header">
                            <div class="position-title-wrap">
                                <div class="card-role position-title">${this.escapeHTML(p.title)}</div>
                            </div>
                            <span class="activity-badge badge-${positionBadgeClass}">${this.escapeHTML(p.status)}</span>
                        </div>
                        <div class="card-stars">${stars}</div>
                        <div class="card-meta"><span>📍 ${this.escapeHTML(p.location || '未知')}</span><span>💰 ${this.escapeHTML(p.salary || '面议')}</span></div>
                        ${r ? `<div class="card-resume">📄 ${this.escapeHTML(r.name)}</div>` : ''}
                        <div class="card-footer">
                            <span class="card-footer-text">${last ? `最近: ${this.escapeHTML(last.round)}${last.formatNote || last.interviewFormatNote ? ` · ${this.escapeHTML(last.formatNote || last.interviewFormatNote)}` : ''} ${this.escapeHTML(last.date)}` : '暂无面试'}</span>
                            <div class="card-actions position-actions">
                                <button class="card-btn card-btn-edit" onclick="event.stopPropagation();app.openPositionModal('${positionId}')">编辑</button>
                                <button class="card-btn card-btn-advance" onclick="event.stopPropagation();app.advance('${positionId}')">推进</button>
                                <button class="card-btn card-btn-note" onclick="event.stopPropagation();app.openInterviewModal('${positionId}')">记</button>
                            </div>
                        </div>
                    </div>`;
                }).join('') || '<div class="expanded-jobs-empty">暂无岗位，点击添加岗位创建第一个岗位</div>';
                
                return `<div class="company-accordion-item ${isExpanded ? 'is-expanded' : ''}" data-company-id="${companyDomId}">
                <div class="company-card company-accordion-card ${isExpanded ? 'expanded' : ''}" onclick="app.toggleCompanyJobs('${companyId}', event)">
                    <div class="company-card-header company-accordion-header">
                        <div class="company-title-block">
                            <button class="drag-handle${dragDisabledClass}" title="${isOrderingDisabled ? '筛选状态下不可排序' : '拖拽排序'}" onclick="event.stopPropagation()" aria-label="拖拽排序"><span></span></button>
                            <div class="card-logo">${this.escapeHTML((c.name || '公')[0])}</div>
                            <div>
                                <div class="company-card-name">${this.escapeHTML(c.name || '未命名公司')}</div>
                                <div class="company-card-meta company-card-meta-icons">${companyMetaHtml}</div>
                            </div>
                        </div>
                        <div class="company-summary-row">
                            <span>${this.escapeHTML(jobCountText)}</span>
                            <span class="activity-badge badge-${badgeClass}">${this.escapeHTML(highestStatus)}</span>
                            <span>${this.escapeHTML(lastUpdatedText)}</span>
                        </div>
                        <div class="company-header-actions" onclick="event.stopPropagation()">
                            <button class="card-btn" onclick="event.stopPropagation();app.openPositionModal(null, '${companyId}')">添加岗位</button>
                            <button class="card-btn" onclick="event.stopPropagation();app.openModal('company', '${companyId}')">编辑公司</button>
                            <div class="company-order-actions">
                                <button class="company-order-btn" ${upDisabled} onclick="event.stopPropagation();app.moveCompanyOrder('${companyId}', -1, event)">▲</button>
                                <button class="company-order-btn" ${downDisabled} onclick="event.stopPropagation();app.moveCompanyOrder('${companyId}', 1, event)">▼</button>
                            </div>
                            <button class="company-toggle-btn" onclick="event.stopPropagation();app.toggleCompanyJobs('${companyId}', event)">${isExpanded ? '收起岗位' : '展开岗位'}</button>
                        </div>
                    </div>
                    ${c.notes ? `<div class="company-card-meta company-notes">${this.escapeHTML(c.notes)}</div>` : ''}
                </div>
                    ${isExpanded ? `<div class="expanded-jobs-wrapper" onclick="event.stopPropagation()">
                        <div class="expanded-jobs-grid">${jobsHtml}</div>
                    </div>` : ''}
                </div>`;
            }).join('');
        }
        
        document.getElementById('company-accordion-list').innerHTML = html;
        this.initCompanySortable();
    },

    toggleCompanyJobs(companyId, event) {
        if (event) event.stopPropagation();
        if (this.expandedCompanyIds.has(companyId)) {
            this.expandedCompanyIds.delete(companyId);
        } else {
            this.expandedCompanyIds.add(companyId);
        }
        this.renderPositions();
    },

    expandAllCompanies() {
        this.expandedCompanyIds = new Set(this.renderedCompanyIds);
        this.renderPositions();
    },

    collapseAllCompanies() {
        this.expandedCompanyIds.clear();
        this.renderPositions();
    },

    initCompanySortable() {
        const list = document.getElementById('company-accordion-list');
        if (this.companySortable) {
            this.companySortable.destroy();
            this.companySortable = null;
        }
        if (!list || this.currentView !== 'positions' || this.isCompanyOrderingDisabled()) return;
        if (!window.Sortable) {
            console.warn('SortableJS 未加载，公司拖拽排序暂不可用。');
            return;
        }

        this.companySortable = Sortable.create(list, {
            handle: '.drag-handle',
            animation: 180,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            onEnd: () => this.persistCompanyOrderFromDOM()
        });
    },

    persistCompanyOrderFromDOM() {
        const list = document.getElementById('company-accordion-list');
        if (!list || this.isCompanyOrderingDisabled()) {
            this.renderPositions();
            return;
        }

        const orderedIds = Array.from(list.querySelectorAll('[data-company-id]'))
            .map(item => item.dataset.companyId)
            .filter(Boolean);
        if (!orderedIds.length) return;

        this.data = DataStore.get();
        this.data.companies = this.data.companies.map(company => {
            const index = orderedIds.indexOf(company.id);
            return index >= 0 ? { ...company, order: index * 10 } : company;
        });
        DataStore.set(this.data);
        this.data = DataStore.get();
        this.renderPositions();
        this.backgroundSync();
    },

    moveCompanyOrder(companyId, direction, event) {
        if (event) event.stopPropagation();
        if (this.isCompanyOrderingDisabled()) return;

        const companies = this.getSortedCompanies();
        const currentIndex = companies.findIndex(company => company.id === companyId);
        const targetIndex = currentIndex + direction;
        if (currentIndex < 0 || targetIndex < 0 || targetIndex >= companies.length) return;

        const reordered = [...companies];
        [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]];
        const orderMap = new Map(reordered.map((company, index) => [company.id, index * 10]));

        this.data = DataStore.get();
        this.data.companies = this.data.companies.map(company => (
            orderMap.has(company.id) ? { ...company, order: orderMap.get(company.id) } : company
        ));
        DataStore.set(this.data);
        this.data = DataStore.get();
        this.renderPositions();
        this.backgroundSync();
    },

    advance(id) {
        const p = this.data.positions.find(x => x.id === id);
        const flow = ['未投递', '投递', '笔试', '一面', '二面', '三面', 'HR面', 'Offer'];
        const idx = flow.indexOf(p.status);
        if (idx >= 0 && idx < flow.length - 1) {
            DataStore.updatePosition(id, { status: flow[idx + 1] });
            this.data = DataStore.get();
            this.renderPositions();
            this.backgroundSync();
            this.showToast(`岗位已推进到${flow[idx + 1]}`);
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
            const filePreviewBtn = (r.content || r.fileData) ? `<button class="card-btn" onclick="app.openResumePreview('${resumeId}')">👁️ 预览</button>` : '';
            const summary = this.getMarkdownSummary(r.content);
            return `<div class="resume-card">
                <div class="resume-header">
                    <div style="display:flex;gap:10px;align-items:center;">
                        <div class="resume-icon ${r.type === 'resume' ? 'pdf' : r.type === 'intro' ? 'mic' : r.type === 'cover' ? 'mail' : 'file'}">${icons[r.type] || icons.other}</div>
                        <div><div class="resume-name">${this.escapeHTML(r.name)}</div><div class="resume-type">${r.type === 'resume' ? '简历' : r.type === 'intro' ? '自我介绍' : r.type === 'cover' ? '求职信' : '其他'} · ${this.escapeHTML(r.target || '通用')}</div></div>
                    </div>
                    <button class="btn-icon" onclick="app.editResume('${resumeId}')">✏️</button>
                </div>
                ${r.version ? `<div class="resume-version">${this.escapeHTML(r.version)}</div>` : ''}
                <div class="resume-content">${this.escapeHTML(summary)}</div>
                <div class="resume-footer"><span>${linked} 个岗位关联</span>${r.fileName ? `<span>📎 ${this.escapeHTML(r.fileName)}</span>` : ''}</div>
                <div style="display:flex;gap:6px;">${filePreviewBtn}${fileDownloadBtn}</div>
            </div>`;
        }).join('') || '<div style="grid-column:1/-1;text-align:center;color:#94a3b8;padding:40px;">暂无资料</div>';

        document.querySelectorAll('.sidebar-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.cat === this.resumeFilter);
        });
    },

    previewFile(resumeId) {
        this.openResumePreview(resumeId);
    },

    syncModalOpenState() {
        const hasOpenModal = ['modal-backdrop', 'detail-backdrop', 'resume-preview-backdrop']
            .some(id => {
                const el = document.getElementById(id);
                return el && !el.classList.contains('hidden');
            });
        document.body.classList.toggle('modal-open', hasOpenModal);
    },

    openResumePreview(resumeId) {
        const resume = this.data.resumes.find(r => r.id === resumeId);
        if (!resume) {
            alert('资料不存在');
            return;
        }

        const backdrop = document.getElementById('resume-preview-backdrop');
        const title = document.getElementById('resume-preview-title');
        const meta = document.getElementById('resume-preview-meta');
        const body = document.getElementById('resume-preview-body');
        const footer = document.getElementById('resume-preview-footer');
        const modal = backdrop?.querySelector('.resume-preview-modal');
        if (!backdrop || !title || !meta || !body || !footer || !modal) return;

        const fileName = resume.fileName || '';
        const ext = fileName.includes('.') ? fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase() : '';
        const isPdf = /\.pdf$/i.test(fileName);
        const isImage = /\.(png|jpe?g|gif|webp)$/i.test(fileName);
        const isMarkdown = !!resume.content || /\.(md|markdown|txt)$/i.test(fileName);
        const typeLabel = resume.type === 'resume' ? '简历' : resume.type === 'intro' ? '自我介绍' : resume.type === 'cover' ? '求职信' : '其他';
        title.textContent = resume.name || '资料预览';
        meta.textContent = [typeLabel, resume.target || '通用', resume.version, fileName].filter(Boolean).join(' · ');
        modal.classList.toggle('pdf-mode', isPdf);
        modal.classList.toggle('image-mode', isImage);
        modal.classList.toggle('markdown-mode', isMarkdown && !isPdf && !isImage);

        let previewHtml = '';
        if (resume.fileData && ext === 'pdf') {
            previewHtml = `<embed class="resume-preview-embed" src="${resume.fileData}" type="application/pdf">`;
        } else if (resume.fileData && ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
            previewHtml = `<img class="resume-preview-image" src="${resume.fileData}" alt="${this.escapeHTML(fileName || resume.name || '资料图片')}">`;
        } else if (resume.content) {
            previewHtml = `<div class="resume-preview-markdown">${this.renderMarkdown(resume.content)}</div>`;
        } else if (resume.fileText && ['md', 'markdown', 'txt'].includes(ext)) {
            previewHtml = `<div class="resume-preview-markdown">${this.renderMarkdown(resume.fileText)}</div>`;
        } else {
            previewHtml = `<div class="resume-preview-empty"><strong>暂不支持在线预览</strong><p>${this.escapeHTML(fileName || '当前资料')} 可以下载后查看。</p></div>`;
        }
        body.innerHTML = previewHtml;

        const resumeArg = this.inlineArg(resume.id);
        const downloadBtn = resume.fileData ? `<button class="btn-secondary" onclick="app.downloadFile('${resumeArg}', '${this.escapeJSString(fileName || '文件')}')">下载文件</button>` : '';
        footer.innerHTML = `${downloadBtn}<button class="btn-secondary" onclick="app.closeResumePreview();app.editResume('${resumeArg}')">编辑资料</button><button class="btn-primary" onclick="app.closeResumePreview()">关闭</button>`;
        backdrop.classList.remove('hidden');
        this.syncModalOpenState();
    },

    closeResumePreview() {
        const backdrop = document.getElementById('resume-preview-backdrop');
        if (backdrop) backdrop.classList.add('hidden');
        this.syncModalOpenState();
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

    normalizeInterviewQAPairs(interview = {}) {
        if (Array.isArray(interview.qaPairs) && interview.qaPairs.length) {
            return interview.qaPairs.map((pair, index) => ({
                id: pair.id || `qa_${index}`,
                question: pair.question || '',
                answer: pair.answer || '',
                tags: Array.isArray(pair.tags)
                    ? pair.tags
                    : String(pair.tags || '').split(/,|，/).map(t => t.trim()).filter(Boolean),
                createdAt: pair.createdAt || interview.createdAt || '',
                updatedAt: pair.updatedAt || interview.updatedAt || pair.createdAt || interview.createdAt || ''
            })).filter(pair => pair.question || pair.answer || pair.tags.length);
        }

        return String(interview.questions || interview.questionText || '')
            .split(/\n/)
            .map(line => line.trim())
            .filter(Boolean)
            .map((question, index) => ({
                id: `${interview.id || 'legacy'}_qa_${index}`,
                question,
                answer: '',
                tags: [],
                createdAt: interview.createdAt || '',
                updatedAt: interview.updatedAt || interview.createdAt || ''
            }));
    },

    renderQAPairEditor(pairs = []) {
        if (!pairs.length) return this.renderQAEmptyState();
        return pairs.map((pair, index) => this.renderQAPairEditorItem(pair, index)).join('');
    },

    renderQAEmptyState() {
        return '<div class="qa-editor-empty">暂无追问记录，请点击右上角新增问答</div>';
    },

    renderQAPairEditorItem(pair = {}, index = 0) {
        const tagsText = Array.isArray(pair.tags) ? pair.tags.join(', ') : (pair.tags || '');
        return `<div class="qa-editor-card" data-qa-id="${this.escapeHTML(pair.id || this.createQAPairId())}" data-created-at="${this.escapeHTML(pair.createdAt || '')}">
            <div class="qa-editor-card-header">
                <div class="qa-editor-label qa-editor-question-title"><span class="qa-label qa-label-q">Q</span><span>问题 / 追问</span></div>
                <div class="qa-card-actions">
                    <button type="button" class="qa-preview-toggle-btn" onclick="app.toggleQAPairPreview(this)" title="预览 Markdown">预览</button>
                    <button type="button" class="qa-add-after-btn" onclick="app.addQAPairAfter(this)" title="在下方新增问答" aria-label="在下方新增问答">＋</button>
                    <button type="button" class="qa-delete-btn" onclick="app.removeQAPair(this)" title="删除此问答" aria-label="删除此问答">×</button>
                </div>
            </div>
            <div class="qa-editor-fields">
                <div class="qa-editor-block qa-editor-question">
                    <textarea class="qa-question" data-field="question" rows="2" placeholder="支持 Markdown：标题、列表、加粗、引用">${this.escapeHTML(pair.question || '')}</textarea>
                </div>
                <div class="qa-editor-block qa-editor-answer">
                    <div class="qa-editor-label"><span class="qa-label qa-label-a">A</span><span>现场回答 / 优化答案</span></div>
                    <textarea class="qa-answer" data-field="answer" rows="3" placeholder="记录你的回答、追问或复盘要点，支持 Markdown">${this.escapeHTML(pair.answer || '')}</textarea>
                </div>
                <div class="qa-editor-block qa-editor-tags">
                    <div class="qa-editor-label"><span>标签</span></div>
                    <input class="qa-tags" data-field="tags" placeholder="算法, 项目, 职业规划" value="${this.escapeHTML(tagsText)}">
                </div>
            </div>
            <div class="qa-preview-panel hidden">
                <div class="qa-bubble qa-bubble-question">
                    <div class="qa-label qa-label-q">Q</div>
                    <div class="qa-content qa-markdown-content qa-preview-question"></div>
                </div>
                <div class="qa-bubble qa-bubble-answer">
                    <div class="qa-label qa-label-a">A</div>
                    <div class="qa-content qa-markdown-content qa-preview-answer"></div>
                </div>
                <div class="qa-preview-hint">预览不会保存 HTML，保存时仍会写入 Markdown 原文。</div>
            </div>
        </div>`;
    },

    createQAPairId() {
        return `qa_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    },

    addQAPair() {
        const list = document.getElementById('qa-pair-list');
        if (!list) return;
        const pairs = this.collectQAPairsFromEditor();
        pairs.push({ id: this.createQAPairId(), question: '', answer: '', tags: [] });
        list.innerHTML = this.renderQAPairEditor(pairs);
        requestAnimationFrame(() => {
            const cards = list.querySelectorAll('.qa-editor-card');
            const newCard = cards[cards.length - 1];
            newCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            newCard?.querySelector('[data-field="question"]')?.focus();
        });
    },

    addQAPairAfter(target) {
        const list = document.getElementById('qa-pair-list');
        if (!list) return;
        const pairs = this.collectQAPairsFromEditor();
        const cards = [...list.querySelectorAll('.qa-editor-card')];
        const clickedCard = target?.closest ? target.closest('.qa-editor-card') : null;
        const index = clickedCard ? cards.indexOf(clickedCard) : Number(target);
        const insertAt = Number.isFinite(index) && index >= 0 ? index + 1 : pairs.length;
        pairs.splice(insertAt, 0, { id: this.createQAPairId(), question: '', answer: '', tags: [] });
        list.innerHTML = this.renderQAPairEditor(pairs);
        requestAnimationFrame(() => {
            const newCard = list.querySelectorAll('.qa-editor-card')[insertAt];
            newCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            newCard?.querySelector('[data-field="question"]')?.focus();
        });
    },

    removeQAPair(btn) {
        const card = btn.closest('.qa-editor-card');
        if (!card) return;
        const list = document.getElementById('qa-pair-list');
        if (list && list.querySelectorAll('.qa-editor-card').length <= 1) {
            card.remove();
            list.innerHTML = this.renderQAEmptyState();
            return;
        }
        card.remove();
    },

    collectQAPairsFromEditor() {
        return [...document.querySelectorAll('#qa-pair-list .qa-editor-card')].map(card => {
            const now = new Date().toISOString();
            const tags = (card.querySelector('[data-field="tags"]')?.value || card.querySelector('.qa-tags')?.value || '')
                .split(/,|，/)
                .map(tag => tag.trim())
                .filter(Boolean);
            return {
                id: card.dataset.qaId || this.createQAPairId(),
                question: (card.querySelector('[data-field="question"]')?.value || card.querySelector('.qa-question')?.value || '').trim(),
                answer: (card.querySelector('[data-field="answer"]')?.value || card.querySelector('.qa-answer')?.value || '').trim(),
                tags,
                createdAt: card.dataset.createdAt || now,
                updatedAt: now
            };
        });
    },

    collectQAPairs() {
        return this.collectQAPairsFromEditor()
            .filter(pair => pair.question || pair.answer || pair.tags.length);
    },

    toggleQAPairPreview(btn) {
        const card = btn.closest('.qa-editor-card');
        if (!card) return;
        const fields = card.querySelector('.qa-editor-fields');
        const preview = card.querySelector('.qa-preview-panel');
        if (!fields || !preview) return;
        const showingPreview = !preview.classList.contains('hidden');
        if (showingPreview) {
            preview.classList.add('hidden');
            fields.classList.remove('hidden');
            btn.textContent = '预览';
            btn.title = '预览 Markdown';
            return;
        }
        const question = card.querySelector('[data-field="question"]')?.value || '';
        const answer = card.querySelector('[data-field="answer"]')?.value || '';
        card.querySelector('.qa-preview-question').innerHTML = this.renderMarkdown(question || '暂无问题');
        card.querySelector('.qa-preview-answer').innerHTML = this.renderMarkdown(answer || '暂无回答');
        fields.classList.add('hidden');
        preview.classList.remove('hidden');
        btn.textContent = '编辑';
        btn.title = '返回编辑';
    },

    renderQAPairsReadOnly(interview, options = {}) {
        const pairs = this.normalizeInterviewQAPairs(interview);
        if (!pairs.length) return '';
        const limit = options.limit || pairs.length;
        return `<div class="qa-thread-list">${pairs.slice(0, limit).map(pair => `
            <div class="qa-pair">
                <div class="qa-bubble qa-bubble-question"><div class="qa-label qa-label-q">Q</div><div class="qa-content qa-markdown-content">${this.renderMarkdown(pair.question || '暂无问题')}</div></div>
                <div class="qa-bubble qa-bubble-answer"><div class="qa-label qa-label-a">A</div><div class="qa-content qa-markdown-content">${this.renderMarkdown(pair.answer || '暂无回答')}</div></div>
                ${pair.tags?.length ? `<div class="qa-readonly-tags">${pair.tags.map(tag => `<span>${this.escapeHTML(tag)}</span>`).join('')}</div>` : ''}
            </div>`).join('')}</div>`;
    },

    getActivityTypes() {
        return ['投递', '笔试', '面试', '复盘', '备注', '其他'];
    },

    getPositionType(title = '') {
        return title.includes('后端') || title.includes('后台') ? '后端' :
            title.includes('前端') ? '前端' :
            title.includes('产品') ? '产品' :
            title.includes('算法') ? '算法' : '其他';
    },

    getAnalyticsStages() {
        return ['未投递', '投递', '笔试', '一面', '二面', '三面', 'HR面', 'Offer', '接受'];
    },

    buildKnowledgeBlindSpots() {
        const sourceFields = [
            'blindSpot', 'blindSpots', 'knowledgeGap', 'knowledgeGaps',
            'weakness', 'weaknesses', 'tags'
        ];
        const cuePattern = /(盲区|短板|薄弱|不会|不熟|没答好|需要补|需要复习|待补|卡住|复盘|知识点)/;
        const records = [];

        const pushRecord = (interview, rawText) => {
            const text = String(rawText || '').trim();
            if (!text) return;
            const position = this.data.positions.find(p => p.id === interview.positionId);
            if (!position) return;
            const company = this.getCompany(position.companyId);
            if (!company) return;
            records.push({
                text,
                summary: text.length > 80 ? `${text.slice(0, 80)}...` : text,
                companyName: company.name || '未知公司',
                positionTitle: position.title || '未知岗位',
                round: interview.round || '未知轮次',
                date: interview.date || interview.createdAt || '未知日期'
            });
        };

        this.data.interviews.forEach(interview => {
            sourceFields.forEach(field => {
                const value = interview[field];
                if (Array.isArray(value)) value.forEach(item => pushRecord(interview, item));
                else if (value) String(value).split(/\n|,|，|;|；/).forEach(item => pushRecord(interview, item));
            });

            this.normalizeInterviewQAPairs(interview).forEach(pair => {
                pair.tags.forEach(tag => pushRecord(interview, tag));
                [pair.question, pair.answer].forEach(value => {
                    String(value || '')
                        .split(/\n/)
                        .map(line => line.trim())
                        .filter(line => cuePattern.test(line))
                        .forEach(line => pushRecord(interview, line));
                });
            });

            [interview.notes, interview.questions].forEach(value => {
                String(value || '')
                    .split(/\n/)
                    .map(line => line.trim())
                    .filter(line => cuePattern.test(line))
                    .forEach(line => pushRecord(interview, line));
            });
        });

        return records;
    },

    buildHighFrequencyQuestions() {
        const questionMap = new Map();
        this.data.interviews.forEach(interview => {
            const position = this.data.positions.find(p => p.id === interview.positionId);
            if (!position) return;
            const company = this.getCompany(position.companyId);
            if (!company) return;

            const questions = this.normalizeInterviewQAPairs(interview).length
                ? this.normalizeInterviewQAPairs(interview).map(pair => pair.question)
                : String(interview.questions || '').split(/\n/);

            questions
                .map(q => String(q || '').trim())
                .filter(Boolean)
                .forEach(question => {
                    const key = question.replace(/\s+/g, ' ').toLowerCase();
                    if (!questionMap.has(key)) {
                        questionMap.set(key, {
                            question,
                            count: 0,
                            sources: []
                        });
                    }
                    const item = questionMap.get(key);
                    item.count++;
                    item.sources.push(`${company.name || '未知公司'} · ${position.title || '未知岗位'} · ${interview.round || '未知轮次'} · ${interview.date || interview.createdAt || '未知日期'}`);
                });
        });

        return [...questionMap.values()]
            .sort((a, b) => b.count - a.count)
            .slice(0, 8);
    },

    renderAnalytics() {
        const typeMap = {};
        this.data.positions.forEach(p => {
            let t = this.getPositionType(p.title || '');
            if (!typeMap[t]) typeMap[t] = { total: 0, iv: 0, offer: 0 };
            typeMap[t].total++;
            if (['一面','二面','三面','HR面','Offer','接受'].includes(p.status)) typeMap[t].iv++;
            if (['Offer','接受'].includes(p.status)) typeMap[t].offer++;
        });

        const typeHtml = Object.entries(typeMap).map(([t, s]) => {
            const ivRate = s.total ? Math.round(s.iv/s.total*100) : 0;
            const ofRate = s.iv ? Math.round(s.offer/s.iv*100) : 0;
            return `<div class="analytics-mini-card"><div class="analytics-mini-head"><span class="font-medium">${this.escapeHTML(t)}</span><span>${s.total} 个岗位</span></div><div class="analytics-mini-metrics"><span>面试率 <strong>${ivRate}%</strong></span><span>Offer率 <strong>${ofRate}%</strong></span></div></div>`;
        }).join('');

        // 招聘漏斗使用“到达当前阶段及以后”的累计口径，展示阶段间转化。
        const stages = this.getAnalyticsStages();
        const activePositions = this.data.positions.filter(p => p.status !== '拒绝');
        const arrivedAtOrBeyond = stage => {
            const stageIndex = stages.indexOf(stage);
            return activePositions.filter(p => {
                const positionIndex = stages.includes(p.status) ? stages.indexOf(p.status) : 0;
                return positionIndex >= stageIndex;
            }).length;
        };

        const funnelHtml = stages.slice(0, -1).map((s, i) => {
            const nextStage = stages[i + 1];
            const currentCount = arrivedAtOrBeyond(s);
            const nextCount = arrivedAtOrBeyond(nextStage);
            const rate = currentCount ? Math.min(100, Math.round(nextCount / currentCount * 100)) : null;
            return `<div class="analytics-funnel-row">
                <div class="analytics-funnel-head">
                    <span>${this.escapeHTML(s)} → ${this.escapeHTML(nextStage)}</span>
                    <span>${currentCount} → ${nextCount} · 转化率 <strong>${rate === null ? '-' : `${rate}%`}</strong></span>
                </div>
                <div class="analytics-funnel-bar"><div style="width:${rate === null ? 0 : rate}%;"></div></div>
            </div>`;
        }).join('');
        const sampleHint = activePositions.length < 5 ? '<div class="analytics-note">样本较少，仅供参考</div>' : '';

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

        const blindSpots = this.buildKnowledgeBlindSpots();
        const blindSpotHtml = blindSpots.length
            ? blindSpots.map(item => `<div class="blind-spot-card">
                <div class="blind-spot-text">${this.escapeHTML(item.summary)}</div>
                <div class="blind-spot-source">${this.escapeHTML(item.companyName)} · ${this.escapeHTML(item.positionTitle)} · ${this.escapeHTML(item.round)} · ${this.escapeHTML(item.date)}</div>
                <div class="blind-spot-original">${this.escapeHTML(item.text)}</div>
            </div>`).join('')
            : '<div style="color:#94a3b8;font-size:13px;">暂无知识盲区数据</div>';

        const highQuestions = this.buildHighFrequencyQuestions();
        const questionHtml = highQuestions.length
            ? highQuestions.map(item => `<div class="question-insight-item">
                <div><strong>${this.escapeHTML(item.question)}</strong><span>${item.count} 次出现</span></div>
                <small>${this.escapeHTML(item.sources.slice(0, 2).join(' / '))}</small>
            </div>`).join('')
            : '<div style="color:#94a3b8;font-size:13px;">暂无高频问题数据</div>';

        const moods = {};
        this.data.interviews.forEach(i => { moods[i.mood||'一般'] = (moods[i.mood||'一般']||0)+1; });
        const totalMood = Object.values(moods).reduce((a,b)=>a+b,0);
        const moodColors = { '紧张':'#f59e0b', '平稳':'#3b82f6', '超水平发挥':'#10b981', '被问懵':'#ef4444', '一般':'#94a3b8' };
        const moodHtml = Object.entries(moods).map(([m,c]) => `<div class="analytics-mood-row"><span>${this.escapeHTML(m)}</span><div><i style="width:${totalMood?Math.round(c/totalMood*100):0}%;background:${moodColors[m]||'#94a3b8'};"></i></div><strong>${c}</strong></div>`).join('');

        const recentReviews = this.data.interviews
            .filter(i => String(i.notes || '').trim())
            .sort((a,b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0))
            .slice(0, 4);
        const reviewHtml = recentReviews.length
            ? recentReviews.map(i => {
                const p = this.data.positions.find(x => x.id === i.positionId);
                const c = p ? this.getCompany(p.companyId) : null;
                const note = String(i.notes || '').trim();
                return `<div class="review-summary-item"><div>${this.escapeHTML(c?.name || '未知公司')} · ${this.escapeHTML(p?.title || '未知岗位')}</div><small>${this.escapeHTML(i.round || '未知轮次')} · ${this.escapeHTML(i.date || i.createdAt || '未知日期')}</small>${this.renderMarkdown(note.length > 120 ? `${note.slice(0, 120)}...` : note)}</div>`;
            }).join('')
            : '<div style="color:#94a3b8;font-size:13px;">暂无复盘摘要</div>';

        const staleJobs = activePositions.filter(p => {
            if (['Offer','接受'].includes(p.status)) return false;
            const updated = new Date(p.updatedAt || p.createdAt || 0).getTime();
            if (!Number.isFinite(updated)) return false;
            return Date.now() - updated > 7 * 86400000;
        }).length;
        const reminderHtml = `<div class="analytics-reminder">
            <strong>${staleJobs}</strong>
            <span>个活跃岗位超过 7 天未更新</span>
        </div>`;

        document.getElementById('analytics-grid').innerHTML = `
            <div class="analytics-layout">
                <div class="analytics-main">
                    <div class="panel analytics-panel"><h3>招聘漏斗转化率</h3>${sampleHint}${funnelHtml || '<div style="color:#94a3b8;">数据不足</div>'}</div>
                    <div class="panel analytics-panel"><h3>面试知识盲区</h3><div class="blind-spot-list">${blindSpotHtml}</div></div>
                    <div class="panel analytics-panel"><h3>高频问题</h3><div class="question-insight-list">${questionHtml}</div></div>
                </div>
                <div class="analytics-side">
                    <div class="panel analytics-panel"><h3>情绪 / 面试体验</h3>${moodHtml || '<div style="color:#94a3b8;">暂无数据</div>'}</div>
                    <div class="panel analytics-panel"><h3>公司 / 岗位推进效率</h3>${typeHtml || '<div style="color:#94a3b8;">数据不足</div>'}${reminderHtml}</div>
                    <div class="panel analytics-panel"><h3>最近面试复盘</h3>${reviewHtml}</div>
                    <div class="panel analytics-panel"><h3>简历版本效果</h3>${resumeHtml || '<div style="color:#94a3b8;">数据不足</div>'}</div>
                </div>
            </div>
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
            this.showToast('Firebase SDK 还没有加载完成', 'error');
            return;
        }

        try {
            await window.FirebaseStore.signIn();
            this.renderSettings();
            this.updateSyncBadge();
            this.showToast('登录成功');
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
            this.showToast('已退出登录', 'info');
        } catch (e) {
            alert('退出失败：' + this.explainFirebaseError(e));
        }
    },

    async uploadFirebase(options = {}) {
        const silent = options.silent === true;
        if (!window.FirebaseStore) {
            if (!silent) {
                this.switchView('settings');
                this.showToast('Firebase SDK 还没有加载完成', 'error');
            }
            return;
        }

        if (!window.FirebaseStore.getUser()) {
            if (!silent) {
                this.switchView('settings');
                alert('请先在设置页点击“Google 登录”。');
            }
            return;
        }

        try {
            this.data = DataStore.get();
            await window.FirebaseStore.upload(DataStore.normalize(this.data));
            this.updateSyncBadge();
            if (!silent) this.showToast('已上传到 Firebase 云端');
        } catch (e) {
            if (silent) {
                console.error('Firebase 后台同步失败', e);
            } else {
                alert('上传失败：' + this.explainFirebaseError(e));
            }
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
                this.showToast('已从 Firebase 云端拉取数据');
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
        if (window.FirebaseStore?.getUser?.()) {
            this.uploadFirebase({ silent: true });
        }
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
        this.showToast('JSON 备份已导出');
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
                    this.showToast('导入成功');
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
        this.showToast('演示数据已加载');
    },

    clearAllData() {
        if (!confirm('确定清空所有数据？不可恢复！')) return;
        DataStore.clear();
        this.data = DataStore.get();
        this.render();
        this.showToast('所有数据已清空', 'warn');
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
        this.syncModalOpenState();

        if (type === 'activity') {
            title.textContent = '补全日志';
            body.innerHTML = `<div class="form-group"><label>日志标题 *</label><input id="m-act-title" placeholder="例如：补充一次复盘记录"></div>
                <div class="form-group"><label>日志详情</label><textarea id="m-act-detail" rows="3" placeholder="记录当时发生了什么"></textarea></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group"><label>日志类型</label><select id="m-act-type">${this.getActivityTypes().map(t => `<option value="${t}">${t}</option>`).join('')}</select></div>
                    <div class="form-group"><label>日期</label><input type="date" id="m-act-date" value="${new Date().toISOString().split('T')[0]}"></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group"><label>关联公司</label><select id="m-act-company"><option value="">不关联</option>${this.data.companies.map(c => `<option value="${this.escapeHTML(c.id)}">${this.escapeHTML(c.name)}</option>`).join('')}</select></div>
                    <div class="form-group"><label>关联岗位</label><select id="m-act-job"><option value="">不关联</option>${this.data.positions.map(p => {
                        const c = this.getCompany(p.companyId);
                        return `<option value="${this.escapeHTML(p.id)}">${this.escapeHTML(c?.name || '未知公司')} · ${this.escapeHTML(p.title || '未知岗位')}</option>`;
                    }).join('')}</select></div>
                </div>`;
            footer.innerHTML = '<div style="margin-left:auto;display:flex;gap:8px;"><button class="btn-secondary" data-action="closeModal">取消</button><button class="btn-primary" data-action="saveManualActivity">保存</button></div>';
        } else if (type === 'company') {
            title.textContent = id ? '编辑公司' : '添加公司';
            const c = id ? this.data.companies.find(x => x.id === id) : {};
            body.innerHTML = `<input type="hidden" id="m-company-id" value="${this.escapeHTML(id || '')}">
                <div class="form-group"><label>公司名称 *</label><input id="m-c-name" value="${this.escapeHTML(c.name || '')}"></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group"><label>行业</label><input id="m-c-industry" value="${this.escapeHTML(c.industry || '')}"></div>
                    <div class="form-group"><label>规模</label><select id="m-c-scale"><option value="">未知</option>${['初创','成长型','大厂','外企','国企'].map(s => `<option value="${s}" ${c.scale===s?'selected':''}>${s}</option>`).join('')}</select></div>
                </div>
                <div class="form-group"><label>城市</label><input id="m-c-city" value="${this.escapeHTML(c.city || '')}"></div>
                <div class="form-group"><label>官网</label><input id="m-c-website" value="${this.escapeHTML(c.website || '')}"></div>
                <div class="form-group"><label>备注 / 简短描述</label><textarea id="m-c-notes" rows="2" placeholder="用于列表页展示的一句话备注，例如：注塑机制造世界龙头企业">${this.escapeHTML(c.notes || '')}</textarea></div>
                <div class="form-group"><label>公司背景（支持 Markdown）</label><textarea id="m-c-background" rows="8" placeholder="可填写公司背景、业务介绍、行业地位、招聘信息等，支持 Markdown">${this.escapeHTML(c.background || '')}</textarea></div>`;
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
                <div class="form-group"><label>内容</label>
                    <div class="markdown-editor">
                        <div class="markdown-editor-tabs">
                            <button type="button" class="markdown-tab active" data-mode="edit" onclick="app.toggleResumeMarkdownMode('edit')">编辑</button>
                            <button type="button" class="markdown-tab" data-mode="preview" onclick="app.toggleResumeMarkdownMode('preview')">预览</button>
                        </div>
                        <textarea id="m-res-content" class="markdown-source" rows="10" oninput="app.updateResumeMarkdownPreview()">${this.escapeHTML(r.content || '')}</textarea>
                        <div id="m-res-content-preview" class="markdown-preview hidden"></div>
                    </div>
                </div>
                <div class="form-group">
                    <label>上传文件（PDF、Word、图片等）</label>
                    <input type="file" id="m-res-file-input" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.txt,.md,.markdown,.xlsx,.xls" onchange="app.handleFileSelect(event)">
                    <div id="file-status" style="font-size:12px;color:#64748b;margin-top:4px;">${fileStatusDisplay}</div>
                </div>
                <input type="hidden" id="m-res-file" value="${this.escapeHTML(r.fileName || '')}">
                <input type="hidden" id="m-res-file-data" value="">
                <input type="hidden" id="m-res-file-text" value="${this.escapeHTML(r.fileText || '')}">`;
            footer.innerHTML = `${id?'<button class="btn-danger" data-action="deleteResume">删除</button>':''}<div style="margin-left:auto;display:flex;gap:8px;"><button class="btn-secondary" data-action="closeModal">取消</button><button class="btn-primary" data-action="saveResume">保存</button></div>`;
        } else if (type === 'interview') {
            const posId = id;
            const ivId = arguments[2] || null;
            const iv = ivId ? this.data.interviews.find(x => x.id === ivId) : {};
            const qaPairs = this.normalizeInterviewQAPairs(iv);
            const syncChecked = ivId ? iv.syncJobStatus !== false : true;
            title.textContent = ivId ? '编辑面试' : '记录面试';
            body.innerHTML = `<input type="hidden" id="m-iv-id" value="${this.escapeHTML(ivId || '')}"><input type="hidden" id="m-iv-pos" value="${this.escapeHTML(posId || '')}">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group"><label>轮次</label><select id="m-iv-round">${['笔试','一面','二面','三面','HR面','其他'].map(r => `<option value="${r}" ${iv.round===r?'selected':''}>${r}</option>`).join('')}</select></div>
                    <div class="form-group"><label>日期</label><input type="date" id="m-iv-date" value="${this.escapeHTML(iv.date || new Date().toISOString().split('T')[0])}"></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group"><label>面试官</label><input id="m-iv-interviewer" value="${this.escapeHTML(iv.interviewer || '')}"></div>
                    <div class="form-group"><label>面试形式备注</label><input id="m-iv-format-note" placeholder="例如：电话面 / 腾讯会议 / 线上面 / 线下面 / 群面" value="${this.escapeHTML(iv.formatNote || iv.interviewFormatNote || '')}"></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group"><label>自我评分</label><input type="range" id="m-iv-rating" min="1" max="5" value="${this.escapeHTML(iv.selfRating || 3)}" oninput="document.getElementById('rating-disp').textContent=this.value+'星'"><span id="rating-disp" style="font-size:12px;color:#3b82f6;font-weight:600;">${this.escapeHTML(iv.selfRating || 3)}星</span></div>
                    <div class="form-group"><label>结果</label><select id="m-iv-result">${['待反馈','通过','挂','待定'].map(r => `<option value="${r}" ${iv.result===r?'selected':''}>${r}</option>`).join('')}</select></div>
                </div>
                <div class="form-group"><label>情绪</label><div class="mood-btn-group">${['紧张','平稳','超水平发挥','被问懵','一般'].map(m => {
                    const selected = (iv.mood || '平稳') === m;
                    return `<button type="button" class="mood-btn ${selected ? 'active selected' : ''}" aria-pressed="${selected ? 'true' : 'false'}" onclick="app.setMoodBtn(this)" data-mood="${m}">${m}</button>`;
                }).join('')}</div><input type="hidden" id="m-iv-mood" value="${this.escapeHTML(iv.mood || '平稳')}"></div>
                <label class="checkbox-row"><input type="checkbox" id="m-iv-sync-status" ${syncChecked ? 'checked' : ''}> 同步更新岗位主进度</label>
                <div class="form-group">
                    <div class="qa-section-head"><label>真实追问与答辩实录</label><button type="button" class="card-btn" onclick="app.addQAPair()">+ 新增问答</button></div>
                    <div id="qa-pair-list" class="qa-editor-list">${this.renderQAPairEditor(qaPairs)}</div>
                    <input type="hidden" id="m-iv-questions" value="${this.escapeHTML(iv.questions || '')}">
                </div>
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
        document.querySelectorAll('.mood-btn').forEach(b => {
            b.classList.remove('active', 'selected');
            b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active', 'selected');
        btn.setAttribute('aria-pressed', 'true');
        document.getElementById('m-iv-mood').value = btn.dataset.mood;
    },

    closeModal() {
        document.getElementById('modal-backdrop').classList.add('hidden');
        this.syncModalOpenState();
    },

    saveCompany() {
        const id = document.getElementById('m-company-id').value;
        const name = document.getElementById('m-c-name').value.trim();
        if (!name) return alert('请输入公司名称');
        const data = {
            name,
            industry: document.getElementById('m-c-industry').value.trim(),
            scale: document.getElementById('m-c-scale').value,
            city: document.getElementById('m-c-city').value.trim(),
            website: document.getElementById('m-c-website').value.trim(),
            notes: document.getElementById('m-c-notes').value.trim(),
            background: document.getElementById('m-c-background').value.trim()
        };
        if (id) DataStore.updateCompany(id, data);
        else DataStore.addCompany(data);
        this.data = DataStore.get();
        this.closeModal();
        this.render();
        this.backgroundSync();
        this.showToast(id ? '公司信息已保存' : '公司已新增');
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
        this.showToast('公司已删除', 'warn');
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
        this.showToast(id ? '岗位已保存' : '岗位已新增');
    },

    deletePosition() {
        const id = document.getElementById('m-pos-id').value;
        if (!id || !confirm('确定删除此岗位？')) return;
        DataStore.deletePosition(id);
        this.data = DataStore.get();
        this.closeModal();
        this.render();
        this.backgroundSync();
        this.showToast('岗位已删除', 'warn');
    },

    toggleResumeMarkdownMode(mode) {
        const source = document.getElementById('m-res-content');
        const preview = document.getElementById('m-res-content-preview');
        if (!source || !preview) return;

        document.querySelectorAll('.markdown-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.mode === mode);
        });

        if (mode === 'preview') {
            preview.innerHTML = this.renderMarkdown(source.value);
            source.classList.add('hidden');
            preview.classList.remove('hidden');
        } else {
            source.classList.remove('hidden');
            preview.classList.add('hidden');
        }
    },

    updateResumeMarkdownPreview() {
        const preview = document.getElementById('m-res-content-preview');
        const source = document.getElementById('m-res-content');
        if (!preview || !source || preview.classList.contains('hidden')) return;
        preview.innerHTML = this.renderMarkdown(source.value);
    },

    saveResume() {
        const id = document.getElementById('m-res-id').value;
        const name = document.getElementById('m-res-name').value.trim();
        if (!name) return alert('请输入资料名称');
        
        const newFileData = document.getElementById('m-res-file-data').value;
        const newFileText = document.getElementById('m-res-file-text')?.value || '';
        const existingResume = id ? this.data.resumes.find(r => r.id === id) : null;
        
        const data = { 
            name, 
            type: document.getElementById('m-res-type').value, 
            target: document.getElementById('m-res-target').value.trim(), 
            version: document.getElementById('m-res-version').value.trim(), 
            content: document.getElementById('m-res-content').value.trim(), 
            fileName: document.getElementById('m-res-file').value.trim(),
            // 如果有新文件数据就用新的，否则保留原有的
            fileData: newFileData || (existingResume?.fileData || ''),
            fileText: newFileText || (existingResume?.fileText || '')
        };
        
        if (id) DataStore.updateResume(id, data);
        else DataStore.addResume(data);
        this.data = DataStore.get();
        this.closeModal();
        this.render();
        this.backgroundSync();
        this.showToast(id ? '资料已保存' : '资料已新增');
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
        
        const fileExt = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.') + 1).toLowerCase() : '';
        const isTextFile = ['md', 'markdown', 'txt'].includes(fileExt);
        const setFileData = (fileData, fileText = '') => {
            document.getElementById('m-res-file').value = file.name;
            document.getElementById('m-res-file-data').value = fileData;
            const fileTextInput = document.getElementById('m-res-file-text');
            if (fileTextInput) fileTextInput.value = fileText;
            document.getElementById('file-status').textContent = `✓ 已选择: ${file.name} (${(file.size / 1024).toFixed(2)}KB)`;
            this.showToast('文件已选择', 'info');
        };

        if (isTextFile) {
            const textReader = new FileReader();
            textReader.onload = (e) => {
                const fileText = e.target.result || '';
                const contentEl = document.getElementById('m-res-content');
                if (contentEl) {
                    const shouldReplace = !contentEl.value.trim() || confirm('是否用上传的文本内容替换当前资料内容？');
                    if (shouldReplace) {
                        contentEl.value = fileText;
                        this.updateResumeMarkdownPreview();
                    }
                }

                const dataReader = new FileReader();
                dataReader.onload = (dataEvent) => setFileData(dataEvent.target.result, fileText);
                dataReader.onerror = () => alert('文件读取失败');
                dataReader.readAsDataURL(file);
            };
            textReader.onerror = () => {
                alert('文件读取失败');
            };
            textReader.readAsText(file);
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            setFileData(e.target.result);
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
        this.showToast('资料已删除', 'warn');
    },

    saveManualActivity() {
        const title = document.getElementById('m-act-title').value.trim();
        if (!title) return alert('请填写日志标题');
        const jobId = document.getElementById('m-act-job').value;
        const position = this.data.positions.find(p => p.id === jobId);
        const date = document.getElementById('m-act-date').value || new Date().toISOString().split('T')[0];
        DataStore.addManualActivity({
            title,
            detail: document.getElementById('m-act-detail').value.trim(),
            type: document.getElementById('m-act-type').value,
            companyId: document.getElementById('m-act-company').value || position?.companyId || '',
            jobId,
            createdAt: date,
            date
        });
        this.data = DataStore.get();
        this.closeModal();
        this.render();
        this.backgroundSync();
        this.showToast('日志已保存');
    },

    deleteActivity(id) {
        if (!confirm('确定要永久删除这条活动记录吗？')) return;
        DataStore.deleteActivity(id);
        this.data = DataStore.get();
        this.render();
        this.backgroundSync();
        this.showToast('活动记录已删除', 'warn');
    },

    saveInterview() {
        const id = document.getElementById('m-iv-id').value;
        const posId = document.getElementById('m-iv-pos').value;
        const qaPairs = this.collectQAPairs();
        const data = {
            positionId: posId,
            round: document.getElementById('m-iv-round').value,
            date: document.getElementById('m-iv-date').value,
            interviewer: document.getElementById('m-iv-interviewer').value.trim(),
            formatNote: document.getElementById('m-iv-format-note').value.trim(),
            interviewFormatNote: document.getElementById('m-iv-format-note').value.trim(),
            selfRating: parseInt(document.getElementById('m-iv-rating').value),
            result: document.getElementById('m-iv-result').value,
            questions: qaPairs.map(pair => pair.question).filter(Boolean).join('\n') || document.getElementById('m-iv-questions').value.trim(),
            qaPairs,
            notes: document.getElementById('m-iv-notes').value.trim(),
            mood: document.getElementById('m-iv-mood').value,
            syncJobStatus: document.getElementById('m-iv-sync-status').checked
        };
        if (id) DataStore.updateInterview(id, data);
        else DataStore.addInterview(data);
        this.data = DataStore.get();
        this.closeModal();
        this.render();
        this.backgroundSync();
        if (!document.getElementById('detail-backdrop').classList.contains('hidden')) {
            this.openDetail(posId);
        }
        this.showToast(id ? '面试记录已保存' : '面试记录已新增');
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
        this.showToast('面试记录已删除', 'warn');
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
        const interviewDetailHtml = ivs.map(i => {
            const formatNote = i.formatNote || i.interviewFormatNote || '';
            return `<div class="interview-record-card" onclick="event.stopPropagation();app.openInterviewModal('${safePositionId}', '${this.inlineArg(i.id)}')">
                <div class="interview-record-header">
                    <div class="interview-title-block">
                        <div class="interview-round-title">${this.escapeHTML(i.round || '面试')}</div>
                        <div class="interview-date-text">${this.escapeHTML(i.date || '未填写日期')}</div>
                    </div>
                    <div class="interview-header-right">
                        <div class="interview-header-meta">
                            <span class="interview-meta-chip">面试官：${this.escapeHTML(i.interviewer || '未知')}</span>
                            ${formatNote ? `<span class="interview-meta-chip">形式：${this.escapeHTML(formatNote)}</span>` : ''}
                            <span class="interview-meta-chip">心情：${this.escapeHTML(i.mood || '未记录')}</span>
                            <span class="interview-meta-chip">评分：${this.escapeHTML(i.selfRating || '-')}/5</span>
                        </div>
                        <span class="interview-result-badge ${i.result==='通过'?'pass':i.result==='挂'?'fail':'pending'}">${this.escapeHTML(i.result || '待反馈')}</span>
                    </div>
                </div>
                ${this.renderQAPairsReadOnly(i)}
                ${i.notes ? `<div class="interview-notes-preview">${this.renderMarkdown(i.notes)}</div>` : ''}
            </div>`;
        }).join('') || '<div class="interview-empty-state"><strong>暂无面试记录</strong><span>点击“记”或“新增面试”记录你的第一次面试复盘</span></div>';
        document.getElementById('detail-body').innerHTML = `
            <div class="detail-overview">
                <div class="detail-main">
                    <div class="detail-status-row">
                        <span class="activity-badge badge-${badgeClass}">${this.escapeHTML(p.status)}</span>
                        <span class="activity-badge badge-投递">${this.escapeHTML(p.location || '未知地点')}</span>
                        <span class="activity-badge badge-投递">${this.escapeHTML(p.salary || '薪资面议')}</span>
                        <span class="detail-stars">${stars}</span>
                    </div>
                    <div class="panel detail-panel">
                        <div class="detail-panel-head">
                            <h4 class="detail-panel-title">进度时间线</h4>
                            <button class="card-btn" onclick="event.stopPropagation();app.openInterviewModal('${safePositionId}')">+ 记面试</button>
                        </div>
                        <div class="timeline">${acts.map(a => `<div class="timeline-item"><div class="timeline-dot"></div><div><span class="timeline-title">${this.escapeHTML(a.title || a.type)}</span><span class="timeline-date">${this.escapeHTML(a.date || String(a.createdAt || '').split('T')[0])}</span>${a.detail || a.notes ? `<div class="timeline-note">${this.escapeHTML(a.detail || a.notes)}</div>` : ''}</div></div>`).join('') || '<div class="detail-empty-line">暂无记录</div>'}</div>
                    </div>
                    <div class="panel detail-panel">
                        <h4 class="detail-panel-title">岗位JD</h4>
                        ${this.renderMarkdown(p.jd || '暂无')}
                    </div>
                </div>
                <div class="detail-sidebar">
                    <div class="panel detail-panel">
                        <h4 class="detail-panel-title">公司信息</h4>
                        <div class="detail-meta-list">
                            <div class="detail-meta-row"><span>行业</span><strong>${this.escapeHTML(c?.industry||'-')}</strong></div>
                            <div class="detail-meta-row"><span>规模</span><strong>${this.escapeHTML(c?.scale||'-')}</strong></div>
                            <div class="detail-meta-row"><span>官网</span><a href="${this.escapeHTML(website)}" target="_blank" rel="noopener noreferrer">${website !== '#' ? '链接' : '-'}</a></div>
                            ${c?.notes ? `<div class="detail-company-note">${this.escapeHTML(c.notes)}</div>` : ''}
                        </div>
                    </div>
                    <div class="panel detail-panel">
                        <h4 class="detail-panel-title">关联资料</h4>
                        ${r ? `<div class="detail-resource-card"><div class="detail-resource-main"><span class="detail-resource-icon">📄</span><div><div class="detail-resource-name">${this.escapeHTML(r.name)}</div><div class="detail-resource-version">${this.escapeHTML(r.version||'')}</div></div></div>${(r.content || r.fileData) ? `<div class="detail-resource-actions"><button class="card-btn" onclick="event.stopPropagation();app.openResumePreview('${this.inlineArg(r.id)}')">👁️</button>${r.fileData ? `<button class="card-btn" onclick="event.stopPropagation();app.downloadFile('${this.inlineArg(r.id)}', '${this.escapeJSString(r.fileName || '文件')}')">⬇️</button>` : ''}</div>` : ''}</div>` : '<div class="detail-empty-line">未关联</div>'}
                    </div>
                </div>
            </div>
            ${c?.background ? `<section class="company-background-section is-collapsed">
                <div class="company-background-head">
                    <h3>公司背景</h3>
                    <button type="button" class="card-btn company-background-toggle" onclick="event.stopPropagation();app.toggleCompanyBackground(this)">展开全文</button>
                </div>
                <div class="company-background-markdown">${this.renderMarkdown(c.background)}</div>
            </section>` : ''}
            <section class="detail-interviews">
                <div class="detail-section-head">
                    <div>
                        <h4 class="detail-section-title">面试记录</h4>
                        <p>长文本复盘、真实问答和优化答案会在这里全宽展示，阅读更完整。</p>
                    </div>
                    <button class="btn-primary" onclick="event.stopPropagation();app.openInterviewModal('${safePositionId}')">新增面试</button>
                </div>
                <div class="interview-record-list">${interviewDetailHtml}</div>
            </section>
        `;
        document.getElementById('detail-backdrop').classList.remove('hidden');
        this.syncModalOpenState();
    },

    closeDetail() {
        document.getElementById('detail-backdrop').classList.add('hidden');
        this.currentDetail = null;
        this.syncModalOpenState();
    },

    toggleCompanyBackground(btn) {
        const section = btn.closest('.company-background-section');
        if (!section) return;
        const expanded = section.classList.toggle('is-expanded');
        section.classList.toggle('is-collapsed', !expanded);
        btn.textContent = expanded ? '收起' : '展开全文';
    },

    openPrepSheet() {
        if (!this.currentDetail) return;
        const p = this.currentDetail;
        const c = this.getCompany(p.companyId);
        const r = this.data.resumes.find(x => x.id === p.resumeId);
        const ivs = this.data.interviews.filter(i => i.positionId === p.id).sort((a,b) => new Date(b.date) - new Date(a.date));
        const questions = ivs.flatMap(i => {
            const pairs = this.normalizeInterviewQAPairs(i);
            return pairs.length ? pairs.map(pair => pair.question).filter(Boolean) : (i.questions||'').split('\n').filter(q=>q.trim());
        }).slice(0, 10);
        const companyWebsite = this.safeURL(c?.website);
        const safeTitle = `${this.escapeHTML(c?.name || '')} · ${this.escapeHTML(p.title || '')}`;
        const prepNoteKey = `prep_notes_${c?.id || 'unknown'}*${p.id}`;
        const savedPrepNote = localStorage.getItem(prepNoteKey) || '';
        const safePrepNoteKey = this.escapeJSString(prepNoteKey);
        const safePrepNote = this.escapeHTML(savedPrepNote);
        const reviewHtml = ivs.length ? `<h2>💡 往期复盘</h2>${ivs.slice(0,2).map(i => {
            const formatNote = i.formatNote || i.interviewFormatNote || '';
            return `<div class="box" style="background:#fdf2f8;border-color:#fbcfe8;"><strong>${this.escapeHTML(i.round)} · ${this.escapeHTML(i.date)}${formatNote ? ` · ${this.escapeHTML(formatNote)}` : ''} · ${this.escapeHTML(i.mood)} · ${this.escapeHTML(i.selfRating)}星</strong>${this.renderQAPairsReadOnly(i)}${this.renderMarkdown(i.notes||'无笔记')}</div>`;
        }).join('')}` : '';

        const win = window.open('', '_blank');
        win.document.write(`<html><head><title>面试准备包 - ${safeTitle}</title><style>body{font-family:-apple-system,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#1e293b;line-height:1.6;}h1{font-size:24px;border-bottom:2px solid #e2e8f0;padding-bottom:12px;}h2{font-size:16px;color:#3b82f6;margin-top:24px;}.box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:12px 0;font-size:14px;}.box strong{color:#0f172a;}ul{margin:8px 0;padding-left:20px;}li{margin:4px 0;}.print-btn{position:fixed;top:20px;right:20px;padding:8px 16px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;}.prep-note-box{border-style:dashed;background:#fffdf7;}.prep-note-area{width:100%;min-height:140px;border:0;background:transparent;resize:vertical;font:inherit;color:#1e293b;line-height:1.6;outline:none;}.prep-note-status{font-size:12px;color:#64748b;margin-top:8px;}.qa-thread-list{display:flex;flex-direction:column;gap:10px;margin-top:10px;}.qa-pair{display:flex;flex-direction:column;gap:8px;}.qa-bubble{display:flex;gap:10px;border-radius:14px;padding:12px;}.qa-bubble-question{background:#eff6ff;border:1px solid #bfdbfe;}.qa-bubble-answer{background:#ecfdf5;border:1px solid #bbf7d0;}.qa-label{align-items:center;border-radius:999px;color:#fff;display:inline-flex;flex-shrink:0;font-size:11px;font-weight:900;height:24px;justify-content:center;width:24px;}.qa-label-q{background:#2563eb;}.qa-label-a{background:#10b981;}.qa-content{color:#1e293b;flex:1;font-size:13px;line-height:1.7;overflow-wrap:anywhere;white-space:pre-wrap;}.qa-content .markdown-body{white-space:normal;}.qa-empty-answer{color:#64748b;}.qa-readonly-tags span{display:inline-block;background:#eef2ff;border-radius:999px;color:#4338ca;font-size:11px;margin:6px 4px 0 0;padding:2px 7px;}.markdown-body{color:#475569;font-size:13px;line-height:1.7;}.markdown-body h1,.markdown-body h2,.markdown-body h3{color:#0f172a;margin:10px 0 6px;}.markdown-body h1{font-size:20px;}.markdown-body h2{font-size:17px;}.markdown-body h3{font-size:15px;}.markdown-body p{margin:8px 0;}.markdown-body ul,.markdown-body ol{margin:8px 0;padding-left:22px;}.markdown-body blockquote{background:#f8fafc;border-left:3px solid #93c5fd;border-radius:6px;margin:10px 0;padding:8px 12px;color:#475569;}@media print{.print-btn,.prep-note-status{display:none;}.prep-note-area{border:0;resize:none;min-height:120px;overflow:visible;}}</style></head><body><button class="print-btn" onclick="window.print()">🖨️ 打印 / 存PDF</button><h1>${safeTitle}</h1><p style="color:#64748b;">生成于 ${this.escapeHTML(new Date().toLocaleDateString())}</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;"><div class="box"><strong>公司信息</strong><br>行业：${this.escapeHTML(c?.industry||'-')}<br>规模：${this.escapeHTML(c?.scale||'-')}<br>地点：${this.escapeHTML(p.location||'-')}<br>薪资：${this.escapeHTML(p.salary||'-')}<br>${companyWebsite !== '#'?`官网：<a href="${this.escapeHTML(companyWebsite)}" rel="noopener noreferrer">${this.escapeHTML(companyWebsite)}</a><br>`:''}${c?.notes?`<div style="margin-top:8px;font-size:13px;">${this.escapeHTML(c.notes)}</div>`:''}</div><div class="box"><strong>岗位JD</strong>${this.renderMarkdown(p.jd||'暂无')}</div></div>${r?`<h2>📄 关联资料：${this.escapeHTML(r.name)}</h2><div class="box" style="background:#ecfdf5;border-color:#a7f3d0;"><div style="white-space:pre-wrap;font-size:13px;">${this.escapeHTML(r.content||'')}</div></div>`:''}${questions.length?`<h2>📝 历史高频问题</h2><div class="box"><ul>${questions.map(q=>`<li>${this.escapeHTML(q)}</li>`).join('')}</ul></div>`:''}${reviewHtml}<h2>✏️ 临时笔记区</h2><div class="box prep-note-box"><textarea id="prep-note-area" class="prep-note-area" placeholder="此处可补充临时知识点、追问清单或面试前提醒...">${safePrepNote}</textarea><div id="prep-note-status" class="prep-note-status">笔记会自动保存到本机</div></div><script>(function(){var key='${safePrepNoteKey}';var area=document.getElementById('prep-note-area');var status=document.getElementById('prep-note-status');var timer;function save(){localStorage.setItem(key,area.value);if(status)status.textContent='已自动保存 '+new Date().toLocaleTimeString();}area.addEventListener('input',function(){clearTimeout(timer);timer=setTimeout(save,250);});area.addEventListener('change',save);})();</script></body></html>`);
        win.document.close();
    },

    getCompany(id) {
        return this.data.companies.find(c => c.id === id);
    }
};

document.addEventListener('DOMContentLoaded', () => app.init());
