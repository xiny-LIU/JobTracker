# JobTracker 修复报告：关闭 GitHub Gist 同步

## 修改目标

将原来的 GitHub Gist 云同步改为更稳定的“本地保存 + JSON 备份/导入”方案。

## 为什么这样改

原同步功能依赖 GitHub Token、Gist ID、网络访问、接口权限等条件。任一条件出错，都会导致同步失败。

新方案不再访问任何外部接口，只使用浏览器本地存储和 JSON 文件备份。它不是真正的自动多设备同步，但更稳定、更容易理解、更适合初学者维护。

## 已修改内容

1. 设置页移除 GitHub Token 和 Gist ID 输入框。
2. 设置页保留“导出 JSON 备份”和“导入 JSON”。
3. 顶部原同步按钮改为“导出 JSON 备份”。
4. `index.html` 不再加载 `js/sync.js`。
5. 删除 `js/sync.js` 文件。
6. `app.js` 中所有自动同步调用改为本地状态刷新。
7. 导出数据时自动清空 `config.token` 和 `config.gistId`，避免旧版本 Token 被备份出去。
8. README 改为本地备份使用说明。

## 一键运行

双击打开 `index.html` 即可使用。

## 换设备方法

旧设备：设置 → 导出 JSON 备份。

新设备：设置 → 导入 JSON。
