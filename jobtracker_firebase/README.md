
# JobTracker

> 面向应届生的求职管理工具，用于记录公司、岗位、面试、简历资料和求职进度。
> 当前版本为纯前端项目，已接入 Firebase，实现网页托管、Google 登录和 Cloud Firestore 云端同步。

在线访问地址：

```text
https://jobtracker-fcdee.web.app
```

---

## 1. 项目简介

JobTracker 是一个轻量级求职管理工具，主要用于帮助应届生整理求职过程中的关键信息，例如：

- 投递了哪些公司
- 每个岗位目前处于什么阶段
- 使用了哪个简历版本
- 面试问了哪些问题
- 哪些岗位需要跟进
- 不同岗位类型、简历版本的效果如何

项目最初是纯本地网页应用，数据保存在浏览器本地。当前版本已经接入 Firebase，可以通过 Google 账号登录，并将数据上传到 Cloud Firestore，实现多设备之间的数据迁移和同步。

---

## 2. 核心功能

### 2.1 仪表盘

仪表盘用于展示整体求职状态，包括：

- 总投递数量
- 面试中数量
- Offer 数量
- 待跟进数量
- 转化漏斗
- 待办提醒
- 近期活动

### 2.2 求职进度管理

支持记录和管理：

- 公司信息
- 岗位名称
- 岗位状态
- 岗位地点
- 薪资范围
- 岗位 JD
- 截止时间
- 意愿度
- 关联简历
- 面试记录

岗位状态包括：

```text
投递 → 笔试 → 一面 → 二面 → 三面 → HR面 → Offer
```

也支持记录：

```text
拒绝
接受
```

### 2.3 资料库

资料库用于保存求职材料，包括：

- 简历
- 自我介绍
- 求职信
- 其他资料

每份资料可以记录：

- 资料名称
- 资料类型
- 目标岗位
- 版本说明
- 正文内容
- 文件名或链接

### 2.4 数据洞察

洞察页面会根据已有数据自动统计：

- 不同岗位类型的投递表现
- 简历版本效果
- 面试知识盲区
- 面试情绪分布

### 2.5 Firebase 云同步

当前版本支持 Firebase 云同步：

- Google 登录
- 上传本地数据到 Cloud Firestore
- 从 Cloud Firestore 拉取数据到当前浏览器
- 多设备使用同一个 Google 账号同步数据

注意：当前版本采用“手动同步”方式，而不是实时自动同步。

推荐使用方式：

```text
电脑端修改数据 → 点击“上传到云端”
手机端打开网页 → Google 登录 → 点击“从云端拉取”
```

### 2.6 本地备份与迁移

即使 Firebase 出现问题，也可以使用 JSON 文件手动备份。

支持：

- 导出 JSON 备份
- 导入 JSON 数据

JSON 可以理解成一种文本格式的数据文件，用来保存公司、岗位、面试、资料等信息。

---

## 3. 技术栈

本项目使用以下技术：

```text
HTML5
CSS3
JavaScript
Firebase Hosting
Firebase Authentication
Cloud Firestore
localStorage
```

说明：

- HTML：负责页面结构。
- CSS：负责页面样式。
- JavaScript：负责页面交互和数据处理。
- Firebase Hosting：负责发布网页，让手机和电脑都能通过网址访问。
- Firebase Authentication：负责 Google 登录。
- Cloud Firestore：负责云端保存求职数据。
- localStorage：浏览器本地存储，用于离线保存当前浏览器的数据。

---

## 4. 项目结构

```text
jobtracker_firebase/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   ├── data.js
│   └── firebase-store.js
└── README.md
```

各文件作用如下：

| 文件                     | 作用                                          |
| ------------------------ | --------------------------------------------- |
| `index.html`           | 页面入口文件，负责放置页面结构                |
| `css/style.css`        | 页面样式文件，负责电脑端和手机端显示效果      |
| `js/data.js`           | 本地数据管理模块，负责 localStorage 读写      |
| `js/app.js`            | 页面交互逻辑，负责按钮、弹窗、渲染和业务操作  |
| `js/firebase-store.js` | Firebase 云同步模块，负责登录、上传和拉取数据 |
| `README.md`            | 项目说明文档                                  |

---

## 5. 数据保存方式

本项目目前有两套数据保存方式。

### 5.1 本地保存

默认情况下，数据会保存在当前浏览器的 localStorage 中。

localStorage 可以理解成浏览器自带的“小型本地仓库”。

特点：

- 不需要联网
- 不需要登录
- 数据只存在当前浏览器
- 换设备后不会自动出现
- 清理浏览器数据可能导致丢失

### 5.2 云端保存

登录 Google 账号后，可以将数据上传到 Cloud Firestore。

Cloud Firestore 可以理解成 Firebase 提供的“云端数据库”。

当前数据路径为：

```text
users/{userId}/jobtracker/main
```

其中：

| 名称           | 含义                                       |
| -------------- | ------------------------------------------ |
| `users`      | 用户集合，可以理解成所有用户数据的总文件夹 |
| `userId`     | Firebase 为当前登录用户生成的唯一编号      |
| `jobtracker` | 本项目的数据集合                           |
| `main`       | 保存完整 JobTracker 数据的文档             |

---

## 6. 本地运行方法

### 方法一：使用 VSCode Live Server

这是最推荐的本地运行方式。

步骤：

1. 用 VSCode 打开项目文件夹。
2. 安装 VSCode 插件：

```text
Live Server
```

3. 右键 `index.html`。
4. 点击：

```text
Open with Live Server
```

5. 浏览器会自动打开类似地址：

```text
http://127.0.0.1:5500/index.html
```

### 方法二：使用 Python 本地服务器

如果电脑安装了 Python，也可以在项目目录执行：

```bash
python -m http.server 8000
```

然后浏览器访问：

```text
http://localhost:8000
```

命令解释：

- `python`：调用 Python。
- `-m http.server`：启动 Python 自带的简单网页服务器。
- `8000`：端口号，可以理解成网页服务的门牌号。

---

## 7. Firebase 配置说明

### 7.1 Firebase 项目

当前 Firebase 项目信息：

```text
项目显示名：JobTracker
项目 ID：jobtracker-fcdee
Hosting 地址：https://jobtracker-fcdee.web.app
```

其中，`fcdee` 是 Firebase 项目 ID 的唯一后缀，没有特殊含义。

### 7.2 Authentication

本项目使用 Google 登录。

需要在 Firebase 控制台开启：

```text
Authentication → 登录方法 → Google
```

同时需要在授权域名中添加：

```text
localhost
127.0.0.1
jobtracker-fcdee.firebaseapp.com
jobtracker-fcdee.web.app
```

授权域名的作用是告诉 Firebase：哪些网址允许使用 Google 登录。

### 7.3 Firestore 数据库

本项目使用 Cloud Firestore 保存云端数据。

建议 Firestore 规则设置为：

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/jobtracker/{docId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

规则解释：

| 变量                  | 含义                                       |
| --------------------- | ------------------------------------------ |
| `database`          | Firestore 数据库名称，默认是 `(default)` |
| `users`             | 用户数据集合                               |
| `userId`            | 数据路径中的用户编号                       |
| `jobtracker`        | JobTracker 项目数据集合                    |
| `docId`             | 文档编号，当前主要使用 `main`            |
| `request.auth`      | 当前请求的登录信息                         |
| `request.auth.uid`  | 当前登录用户的唯一编号                     |
| `allow read, write` | 允许读取和写入                             |
| `&&`                | 并且，左右两个条件都满足才允许             |

这条规则的意思是：

```text
只有登录用户本人，才能读写自己名下的 JobTracker 数据。
```

---

## 8. 部署到 Firebase Hosting

本项目已经部署到 Firebase Hosting。

如果后续修改了代码，需要重新部署。

由于本地 Firebase CLI 登录可能失败，推荐使用 Firebase 控制台的 Cloud Shell 部署。

### 8.1 重新上传项目

将本地项目文件夹压缩成：

```text
jobtracker_firebase.zip
```

然后进入 Firebase 控制台，打开 Cloud Shell Editor，上传 zip 文件。

### 8.2 删除旧版本

在 Cloud Shell 终端中执行：

```bash
cd ~
rm -rf ~/jobtracker_firebase
rm -f ~/*.zip
```

命令解释：

- `cd ~`：进入 Cloud Shell 用户主目录。
- `rm -rf ~/jobtracker_firebase`：删除旧项目文件夹。
- `rm -f ~/*.zip`：删除旧压缩包。

风险提示：

`rm -rf` 是强制删除命令，只建议删除明确知道的目录。这里删除的是 Cloud Shell 中的旧项目副本，不会删除本地电脑文件，也不会删除 Firestore 数据。

### 8.3 解压新版项目

上传新版 zip 后执行：

```bash
unzip jobtracker_firebase.zip
cd jobtracker_firebase
ls
```

确认能看到：

```text
index.html
css
js
```

### 8.4 写入 Firebase Hosting 配置

执行：

```bash
cat > firebase.json <<'EOF'
{
  "hosting": {
    "public": ".",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ]
  }
}
EOF
```

配置解释：

| 字段              | 含义                      |
| ----------------- | ------------------------- |
| `firebase.json` | Firebase Hosting 配置文件 |
| `hosting`       | 表示这是网页托管配置      |
| `public`        | 要发布的网站目录          |
| `"."`           | 当前文件夹                |
| `ignore`        | 部署时忽略的文件          |

### 8.5 部署

执行：

```bash
firebase deploy --only hosting --project jobtracker-fcdee
```

命令解释：

- `firebase deploy`：执行部署。
- `--only hosting`：只部署网页托管部分。
- `--project jobtracker-fcdee`：指定 Firebase 项目 ID。

部署成功后会看到：

```text
Hosting URL: https://jobtracker-fcdee.web.app
```

---

## 9. 推荐使用流程

### 9.1 电脑端使用

```text
打开 https://jobtracker-fcdee.web.app
↓
Google 登录
↓
添加公司、岗位、面试记录
↓
进入设置
↓
点击“上传到云端”
```

### 9.2 手机端使用

```text
打开 https://jobtracker-fcdee.web.app
↓
Google 登录同一个账号
↓
进入设置
↓
点击“从云端拉取”
```

### 9.3 换设备使用

```text
旧设备：上传到云端
新设备：Google 登录同一个账号
新设备：从云端拉取
```

---

## 10. 常见问题

### 10.1 手机打不开 `127.0.0.1`

`127.0.0.1` 只代表当前设备自己。

在电脑上：

```text
127.0.0.1 = 电脑自己
```

在手机上：

```text
127.0.0.1 = 手机自己
```

所以手机不能通过电脑的 `127.0.0.1` 打开本地网页。正式使用时应访问：

```text
https://jobtracker-fcdee.web.app
```

### 10.2 Google 登录失败

可能原因：

- 没有开启 Firebase Authentication 的 Google 登录
- 当前网址没有加入授权域名
- 浏览器拦截了弹窗
- 网络无法访问 Google 登录服务

检查位置：

```text
Firebase 控制台 → Authentication → 设置 → 已获授权的网域
```

### 10.3 上传失败

可能原因：

- 没有登录 Google
- Firestore 规则不正确
- 网络不稳定
- Firebase 配置文件错误

建议检查：

```text
Cloud Firestore → 规则
```

并确认规则允许当前登录用户读写自己的数据。

### 10.4 从云端拉取后本地数据被覆盖

这是正常现象。

“从云端拉取”的含义是：

```text
用云端数据覆盖当前浏览器本地数据
```

因此，在拉取之前建议先导出 JSON 备份。

### 10.5 修改代码后手机还是旧页面

可能是浏览器缓存导致。

解决方法：

- 刷新网页
- 关闭标签页后重新打开
- 清理浏览器缓存
- 换一个浏览器测试

---

## 11. 安全说明

### 11.1 Firebase 配置不是传统密码

前端代码中会包含 Firebase 配置，例如：

```js
apiKey
authDomain
projectId
appId
```

这些字段用于让网页连接到 Firebase 项目。
它们不是传统意义上的密码。

真正保护数据安全的是：

```text
Firebase Authentication
+
Firestore Security Rules
```

### 11.2 不要公开测试模式规则

如果 Firestore 使用测试模式，规则可能过于宽松。

不建议长期使用类似下面的规则：

```js
allow read, write: if true;
```

这会允许任何人读写数据库。

建议使用本项目提供的用户隔离规则：

```js
allow read, write: if request.auth != null && request.auth.uid == userId;
```

---

## 12. 开发计划

后续可继续改进：

- 自动同步：每次修改数据后自动上传云端
- 冲突处理：当本地和云端都有修改时提示用户选择
- 更完善的移动端界面
- 面试日历提醒
- 岗位数据导出为 Excel
- 简历版本效果图表
- 多账号数据隔离优化
- 删除确认与误删恢复
- 云端更新时间显示

---

## 13. 一键运行指南

### 本地预览

```text
VSCode 打开项目
↓
右键 index.html
↓
Open with Live Server
```

### 线上使用

```text
打开 https://jobtracker-fcdee.web.app
↓
Google 登录
↓
正常使用
```

### 重新部署

```bash
cd jobtracker_firebase
firebase deploy --only hosting --project jobtracker-fcdee
```

如果在本地 Firebase CLI 登录失败，使用 Cloud Shell 部署。

---

## 14. License

MIT
