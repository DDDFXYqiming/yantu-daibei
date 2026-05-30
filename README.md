# 研途带背 / Yantu Daibei

一个面向「在职/转脱产考研、复试/调剂焦虑、需要资料定制和 AI 带背」人群的 Android-first Expo 项目。

## 产品定位

核心不是泛泛的学习打卡，而是：

- 把考研计划拆成可执行的每日任务；
- 用 55/5 番茄钟和复盘闭环固定学习节奏；
- 把用户粘贴的讲义/真题/笔记生成带背卡片；
- 记录院校/专业/分数线/成本，辅助复试和调剂决策；
- 用 RevenueCat 预留一次性 Pro 解锁，优先 Android 上架。

## 快速开始

```bash
npm install
cp .env.example .env
npx expo start --android
```

如果只做普通 UI 和本地功能，可以用 Expo Go 预览。接入 RevenueCat/内购后，需要 development build：

```bash
npx eas login
npx eas init
npx eas build --platform android --profile development
```

## Android 上架路径

1. 创建 Google Play Console 应用。
2. 创建内购商品：`pro_lifetime`。
3. 在 RevenueCat 创建项目、App、Entitlement：`premium`，Offering：`default`。
4. 配置 `.env` 中的 `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`。
5. 关闭 mock：`EXPO_PUBLIC_USE_MOCK_PURCHASES=false`。
6. 生成 AAB：

```bash
npx eas build --platform android --profile production
```

7. 上传 Google Play 测试轨道，完成 closed testing 后申请 production access。

## 免费版 / Pro 设计

免费版：

- 1 个备考档案；
- 最多 2 份资料；
- 每份资料最多生成 12 张带背卡；
- 基础番茄钟、基础复盘、院校决策表。

Pro：

- 不限资料和卡片；
- 一键生成周计划；
- 周报导出文案；
- 更完整的复试/调剂决策字段；
- 未来接云端 AI 资料定制。

## 项目结构

```text
App.tsx
src/
  components/       复用 UI 组件
  data/             初始样例数据
  screens/          功能页面
  services/         存储、计划、资料生成、购买
  types.ts          业务类型
  styles.ts         主题和样式
assets/             图标和启动图
docs/               产品和上架说明
```

## 重要说明

这个项目不包含 `node_modules`，压缩包是源码工程。安装依赖后可运行。RevenueCat 默认 mock，避免你在未配置 Google Play 商品前被内购流程卡住。
