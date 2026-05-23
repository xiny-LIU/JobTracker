# JobTracker

> 专为应届生设计的求职管理工具。纯前端实现，数据通过 GitHub Gist 自动同步，手机/平板/电脑全平台实时一致。

## 特点

- ✅ **零后端、零数据库、零成本** —— 数据存在你自己的 GitHub 私有 Gist 里
- ✅ **全平台同步** —— 手机浏览器打开同一个网址，数据自动拉取
- ✅ **面试准备包** —— 一键生成可打印的面试速查单页
- ✅ **数据洞察** —— 自动统计面试通过率、简历版本效果、知识盲区词云
- ✅ **完全私有** —— Token 只存在你的浏览器，开发者看不到任何数据

## 在线使用

直接访问 GitHub Pages 链接即可使用（部署后替换此处）。

## 本地使用

只需一个现代浏览器，无需安装任何工具：

1. 下载本项目所有文件
2. 用浏览器打开 `index.html`
3. 开始使用

## 开启云同步（推荐）

1. 打开网页，进入「设置」页
2. 点击 [生成 GitHub Token](https://github.com/settings/tokens/new?scopes=gist&description=JobTracker)，仅勾选 `gist` 权限
3. 复制 Token 粘贴到设置页，点击保存
4. 此后每次数据变动自动同步到 GitHub Gist，换设备时自动拉取

## 项目结构

```
jobtracker/
├── index.html          # 页面入口
├── css/
│   └── style.css       # 样式
├── js/
│   ├── data.js         # 本地数据管理（localStorage）
│   ├── sync.js         # GitHub Gist 同步
│   └── app.js          # 界面与交互逻辑
└── README.md
```

## 技术栈

- 原生 HTML5 / CSS3 / JavaScript（无框架）
- localStorage 本地持久化
- GitHub Gist API 云端同步
- GitHub Pages 免费托管

## 数据安全

- 所有数据首先保存在浏览器本地（localStorage）
- 仅当用户主动配置 GitHub Token 后才同步到 Gist
- Gist 默认设为私有（`public: false`），他人无法访问
- Token 仅保存在用户浏览器本地，不上传到任何第三方服务器

## License

MIT
