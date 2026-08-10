# anitalee.cn 设计规范

> 给下一个改这个网站的人（或 AI）看的。改样式前先读这个，别凭感觉来。

## 设计气质（先理解这个，再动手）

**暖色纸感、专业、克制、有人味。**

- ✅ 像一本排版讲究的纸质作品集
- ❌ 不要冷灰科技风、不要霓虹、不要渐变炫光、不要阴影堆叠
- ❌ 不要圆角拉满成"卡片博物馆"，间距克制才有呼吸感

## 颜色变量（globals.css :root）

| 变量 | 值 | 用途 |
|---|---|---|
| `--paper` | #fbfaf7 | 主背景（米白） |
| `--paper-deep` | #f3f0e9 | 次背景/标签底色 |
| `--white` | #ffffff | 卡片/药丸底 |
| `--ink` | #3a3733 | 主文字（暖深灰，不是纯黑） |
| `--ink-soft` | #4f4d48 | 次文字 |
| `--muted` | #77736b | 弱文字/说明 |
| `--line` | #dedbd4 | 分隔线/边框 |
| `--rose` | #a95767 | 点缀1（标签、强调） |
| `--rose-soft` | #f2dfe3 | rose 浅底 |
| `--sage` | #596b5e | 点缀2（hover、证据数字1） |
| `--sage-soft` | #dfe8df | sage 浅底 |
| `--amber` | #9b7237 | 点缀3（证据数字3） |
| `--amber-soft` | #f1e7d4 | amber 浅底 |
| `--charcoal` | #2e2b28 | 深色区背景（暖黑） |

**规则**：
- 主文字永远用 `--ink`，不要引入 #000000
- 三个点缀色分工：sage=自然/交付，rose=人/倾听，amber=商务/成果。别混用
- 深色区只有 AI 实践区用，其他地方保持纸感

## 字体

| 场景 | 字体栈 |
|---|---|
| 标题（h1-h3、hero-statement、section-intro h2） | `Inter, "PingFang SC", "Microsoft YaHei", sans-serif` |
| 正文 | `"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif` |
| 数字/编号 | `Inter`（证据数字、案例编号） |
| 代码 | `"SF Mono", Monaco, "Cascadia Code", monospace` |

**字号标尺**：
- h1（Hero 大标题）：64px / 600
- hero-statement：42px / 600
- section-intro h2：40px / 600
- 证据数字：36px / 700（移动端 30px）
- 正文：17px / 行高 1.95（hero-introduction）；15-16px 其他
- 标签/说明：11-13px

**规则**：标题一律 Inter，不要再加回宋体（Songti SC 已于 2026-07-31 移除）。

## 圆角

- 大容器（卡片、拖拽区、结果区）：12px
- 按钮：6-8px
- 小药丸/标签：10px
- 头像/编号圆：50%

**规则**：圆角要克制，不要全站 20px+。

## 间距

- `.shell` 容器：`min(1120px, calc(100% - 48px))`
- 段落 max-width：1100px（hero 文本、section-intro）
- section 上下 padding：76-82px
- 卡片内 padding：24-48px
- Hero min-height：620px

## 组件规范

### 按钮（两种，不要第三种）
- **主按钮** `.primary-link`：ink 底白字，hover 变 rose
- **次按钮** `.text-link`：透明底 ink 描边，hover 反色（ink 底白字）
- 高度 44px，圆角 6px，14px / 700

### 药丸标签 `.brand-tag`
- paper-deep 底 + line 描边，10px 圆角，11px / 500
- 只用于 Hero 顶部品牌区，其他地方的标签参考 .proof-tag 风格

### 区段标签 `.section-label`
- rose 色 13px / 700，前面带 24px 装饰短线（::before 实现）
- Hero 区的 `.role` 不带装饰线，别搞混

### 证据数字 `.evidence-item strong`
- 36px / 700 / Inter，颜色按顺序：sage → rose → amber（第 4 个回 sage 默认色）

### 案例编号 `.case-meta > span`
- 48px 白底圆，2px 描边，颜色随 case-sage / case-rose / case-amber

### 分隔
- 区块间用 1px `--line` 线，不要阴影堆叠
- 深色区 timeline 用 #515854

## 深色区（.section-dark）

- 背景：`--charcoal`（暖黑 #2e2b28）
- 标题文字：白
- 弱文字：#c3c6c3
- 强调色：#e6b7c1（浅 rose）
- 只用于"当前 AI 实践"区，全站只此一处深色

## 内容红线（不可碰）

1. 不自称 AI 专家/架构师/资深技术 FDE
2. 不公开客户/公司/投标/个人机密（案例必须匿名脱敏）
3. 不炫技/不堆动画/不堆 AI 工具 Logo
4. 涉及招聘/薪资/岗位信息须联网核验并标日期
5. 不出现真实姓名"李想"，统一用 "Anita / 大想"

## 部署流程（别跳过）

```bash
npm run build
npx wrangler versions upload --name anitalee-website
npx wrangler versions deploy <VERSION_ID> --name anitalee-website --yes
```

详细约定见 `/Volumes/大想T7/AI-职业与实践/00_协作区/for_codex_部署约定.md`

---

_最后更新：2026-07-31（字体改 Inter、证据数字放大、标签药丸化、深色区暖化）_
