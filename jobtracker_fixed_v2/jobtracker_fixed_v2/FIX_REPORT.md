# JobTracker 修复报告

## 1. 项目全景

这是一个纯前端项目：

- `index.html`：页面入口，负责加载样式和脚本。
- `css/style.css`：页面样式。
- `js/data.js`：本地数据读写，使用浏览器 `localStorage`。
- `js/sync.js`：GitHub Gist 云同步。
- `js/app.js`：界面渲染、按钮事件、弹窗、同步操作。

`localStorage` 是浏览器自带的小型本地存储空间，可以理解为“浏览器里的小记事本”。

## 2. 问题分级

### 致命错误：资源路径不匹配

错误现象：直接把你上传的 5 个文件放在同一文件夹后打开 `index.html`，页面会找不到 `css/style.css`、`js/data.js`、`js/sync.js`、`js/app.js`。

原因解释：`index.html` 写的是文件夹路径，例如：

```html
<link rel="stylesheet" href="css/style.css">
<script src="js/data.js"></script>
<script src="js/sync.js"></script>
<script src="js/app.js"></script>
```

也就是说，浏览器会去找 `css` 文件夹和 `js` 文件夹。

修复方案：按照 README 中的项目结构重新整理文件夹。

```text
jobtracker_fixed/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── data.js
│   ├── sync.js
│   └── app.js
├── README.md
└── FIX_REPORT.md
```

预防建议：以后看到 `href="css/xxx"` 或 `src="js/xxx"`，就说明文件必须放在对应文件夹里。

---

### 功能缺陷：新增投递/推进进度/新增面试时，活动记录可能丢失

错误现象：新增岗位后，岗位能保存，但“近期活动”不一定出现“新增投递”。

原因解释：原代码中，`addPosition()` 先把岗位放进 `data`，然后调用 `addActivity()`。但 `addActivity()` 自己又重新从 `localStorage` 读了一份旧数据，写入活动后，`addPosition()` 最后又把没有活动的旧 `data` 覆盖回去。

可以把它理解成：

1. A 同学在纸上写了“新增岗位”；
2. B 同学拿旧纸写了“新增活动”；
3. A 同学最后把自己的纸交上去；
4. B 写的“新增活动”被覆盖了。

修改位置：`js/data.js`。

修改后重点代码：

```js
addPosition(pos) {
    const data = this.get();
    pos.id = this.uid('p');
    pos.createdAt = new Date().toISOString();
    pos.updatedAt = pos.createdAt;
    data.positions.push(pos);
    this.addActivity(pos.id, pos.status, '新增投递', pos.createdAt, data);
    this.set(data);
    return pos;
}
```

预防建议：同一次保存流程中，尽量操作同一个 `data` 对象，不要中途反复读取旧数据再覆盖。

---

### 功能缺陷：导入 JSON 数据缺少字段时，页面可能报错

错误现象：如果导入的 JSON 文件缺少 `config`、`activities` 等字段，页面后续访问这些字段时可能出错。

原因解释：JavaScript 访问不存在的对象属性时，容易出现类似 `Cannot read properties of undefined` 的错误。意思是：代码想从“空东西”里面继续拿东西。

修复方案：新增 `DataStore.normalize(data)`，在读取、保存、导入数据时补齐默认结构。

修改位置：`js/data.js` 第 27–40 行。

```js
normalize(data) {
    const base = this.getDefault();
    const safe = data && typeof data === 'object' ? data : {};
    return {
        ...base,
        ...safe,
        companies: Array.isArray(safe.companies) ? safe.companies : [],
        positions: Array.isArray(safe.positions) ? safe.positions : [],
        resumes: Array.isArray(safe.resumes) ? safe.resumes : [],
        interviews: Array.isArray(safe.interviews) ? safe.interviews : [],
        activities: Array.isArray(safe.activities) ? safe.activities : [],
        config: { ...base.config, ...(safe.config || {}) }
    };
}
```

这里的变量解释：

- `data`：外部传进来的原始数据。
- `base`：默认的完整数据结构。
- `safe`：确认过不是空值的数据对象。
- `companies`：公司列表。
- `positions`：岗位列表。
- `resumes`：资料列表。
- `interviews`：面试记录列表。
- `activities`：活动时间线列表。
- `config`：同步配置，包括 Token 和 Gist ID。

---

### 功能缺陷：手动同步首次创建 Gist 后，没有保存新 Gist ID

错误现象：如果只有 Token、没有 Gist ID，点击手动同步可能创建了云端 Gist，但本地没有保存新生成的 Gist ID，后续同步不稳定。

原因解释：`Sync.push()` 会返回新建的 `gistId`，但原代码没有把它写回配置。

修复方案：在 `manualSync()` 中接收返回值，并写入本地配置。

修改位置：`js/app.js` 第 328–332 行。

```js
const result = await Sync.push(DataStore.get(), cfg.token, cfg.gistId);
if (!cfg.gistId && result.gistId) {
    DataStore.setConfig({ gistId: result.gistId });
    this.data = DataStore.get();
}
```

变量解释：

- `result`：云同步函数返回的结果。
- `cfg`：当前同步配置。
- `cfg.token`：GitHub Token，用来证明你有权限操作 Gist。
- `cfg.gistId`：目标 Gist 的唯一编号。
- `result.gistId`：新创建或更新后的 Gist 编号。

---

### 数据一致性问题：删除公司时没有同步删除相关面试和活动

错误现象：删除公司后，相关岗位消失，但相关面试记录、活动记录可能仍留在数据里。

原因解释：岗位、面试、活动之间是有关联的。删除公司时，只删除公司和岗位还不够，也要把这些岗位对应的面试、活动删掉。

修复方案：先找出该公司下所有岗位 ID，再删除这些岗位关联的面试和活动。

修改位置：`js/app.js` 第 522–535 行。

```js
const positionIds = this.data.positions.filter(p => p.companyId === id).map(p => p.id);
this.data.companies = this.data.companies.filter(c => c.id !== id);
this.data.positions = this.data.positions.filter(p => p.companyId !== id);
this.data.interviews = this.data.interviews.filter(i => !positionIds.includes(i.positionId));
this.data.activities = this.data.activities.filter(a => !positionIds.includes(a.positionId));
```

变量解释：

- `id`：要删除的公司 ID。
- `positionIds`：这家公司下面所有岗位的 ID 列表。
- `p`：单个岗位对象。
- `i`：单个面试对象。
- `a`：单个活动对象。

---

## 3. 验证结果

已执行 JavaScript 语法检查：

```bash
node --check js/data.js
node --check js/sync.js
node --check js/app.js
```

结果：三个文件均通过语法检查。

已验证活动记录修复：

- 原版：新增岗位后活动数为 `0`。
- 修复版：新增岗位后活动数为 `1`。

## 4. 一键运行指南

### 最简单方式

1. 解压 `jobtracker_fixed.zip`。
2. 进入 `jobtracker_fixed` 文件夹。
3. 双击 `index.html`。

### 调试方式

在 `jobtracker_fixed` 文件夹中打开终端，执行：

```bash
python -m http.server 8000
```

然后浏览器访问：

```text
http://localhost:8000
```

命令作用：临时启动一个本地网页服务器，让浏览器像访问普通网站一样加载项目文件。

风险说明：这条命令通常很安全，但它会把当前文件夹里的文件提供给本机浏览器访问，所以不要在包含隐私文件的目录下运行。

## 5. 后续学习路径

1. 先学会看浏览器控制台：重点看红色报错。
2. 再学会区分 HTML、CSS、JavaScript 各自负责什么。
3. 然后学习 `localStorage` 的读写流程。
4. 最后学习“数据结构一致性”：删除一个主数据时，要同步清理它关联的子数据。
