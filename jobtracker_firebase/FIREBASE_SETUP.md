# JobTracker Firebase 同步版使用说明

## 1. 必须先在 Firebase 控制台完成的设置

### 1.1 开启 Google 登录

进入：

Firebase Console → Authentication → Sign-in method → Google → Enable

保存后，项目才能弹出 Google 登录窗口。

### 1.2 设置 Firestore 规则

进入：

Firebase Console → Cloud Firestore → 规则

把规则改成：

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

这条规则表示：只有当前登录用户本人，才能读取和写入自己的 JobTracker 数据。

## 2. 本地运行方式

请不要直接双击 index.html 测试 Google 登录。推荐在项目根目录执行：

```bash
python -m http.server 8000
```

然后访问：

```text
http://localhost:8000
```

## 3. 使用流程

1. 打开网页。
2. 进入“设置”。
3. 点击“Google 登录”。
4. 在有数据的设备上点击“上传到云端”。
5. 在另一台设备上登录同一个 Google 账号。
6. 点击“从云端拉取”。

## 4. 数据保存路径

Firestore 中的数据路径为：

```text
users/{当前用户 uid}/jobtracker/main
```

其中：

- `users`：用户集合。
- `uid`：Firebase 给当前 Google 用户分配的唯一编号。
- `jobtracker`：JobTracker 项目数据集合。
- `main`：保存完整项目数据的文档。

## 5. 常见错误

### auth/unauthorized-domain

当前网址没有加入 Firebase Authentication 授权域名。

解决方式：Firebase Console → Authentication → Settings → Authorized domains，加入当前域名。

本地开发一般使用：

```text
localhost
```

### permission-denied

Firestore 规则拒绝了读写。

解决方式：检查规则是否和上面给出的规则一致，并确认已经登录 Google 账号。

### Firebase SDK 还没有加载完成

浏览器无法加载 Firebase CDN 文件。

解决方式：检查网络是否可以访问 Firebase，或部署到 Firebase Hosting 后再试。

### 6.后面修改代码

在firebase终端中删除以往文件，上传最新文件夹

rm-rf ~/jobtracker_firebase
cd jobtracker_firebase
firebase deploy --only hosting --project jobtracker-fcdee
