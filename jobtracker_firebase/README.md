# JobTracker Firebase 同步版

这是 JobTracker 的 Firebase 同步版本。

主要能力：

- 本地浏览器保存数据
- Google 登录
- 手动上传数据到 Cloud Firestore
- 手动从 Cloud Firestore 拉取数据
- JSON 文件导入/导出备份

## 快速运行

在项目根目录执行：

```bash
python -m http.server 8000
```

然后打开：

```text
http://localhost:8000
```

## 重要说明

首次使用前，请先阅读 `FIREBASE_SETUP.md`，完成 Firebase Authentication 和 Firestore 规则设置。
