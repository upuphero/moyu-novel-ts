# Phase 6 完成记录：阅读进度条

> 状态：完成（2026-08-13）
> 对应开发计划：Phase 6（P3 优先级）
> 前置：Phase 2（chapterProgress/paragraphIndex）

## 目标回顾

在 Reader 底部实时、低成本展示阅读位置（当前章、总章数、本章百分比、全书百分比）。

## 交付清单

### P6-01 进度计算 — `src/core/progress/progressBar.ts`
- `computeProgress(chapterIndex, chapterProgress, totalChapters)`：
  `bookPercent = (chapterIndex + chapterProgress) / totalChapters`
- 头部（index 0）计入章节总数（ADR-006）；空书（total<=0）**不除零**；
  本章/全书百分比钳制 0..1；NaN/Infinity/负数/非整数安全默认
- 单测 10 个：首章/末章/空书/单章/越界钳制/非法输入/边界钳制

### P6-02 轻量 UI
- `static/webView.html`：`#progressBar`（fill + text）DOM
- `static/js/webView.js`：`updateProgressBar()`——`第 x / y 章 · 本章 % · 全书 %`；
  文本右下角 11px、fill 3px 细条、`pointer-events: none`（不遮挡正文、不拦截点击）
- 触发：切章（showChapter）后立即更新；滚动（scrollAntiShake 50ms debounce）后更新；
  恢复锚点/搜索高亮定位后经 rAF 合并更新

### P6-03 控制滚动成本
- **rAF 合并**：`scheduleProgressUpdate()`——一帧内多次触发只更新一次 DOM（progressRaf 标记）
- 段落定位复用已有二分（`currentParagraphIndex`，hidden 段落视为 Infinity），不遍历全部段落
- 每次 scroll 最多每动画帧更新一次 UI/状态（P6 gate）

### P6-04 可选跳转
- **非首版门槛**：不实现 click/drag 跳转（避免为拖动引入大型状态/UI 依赖）；记录 backlog

## 行为与兼容性

- 用户可见：Reader 底部新增进度细条 + 右下角文字；滚动/切章实时更新；空书不显示数值
- 主题兼容：fill 用 `currentColor`（跟随正文颜色）；文字半透明不干扰阅读

## 修改/新增文件

新增：`src/core/progress/progressBar.ts`、`src/test/unit/progress/progressBar.test.ts`、
`docs/phase6/P6-summary.md`、本文件。
修改：`static/webView.html`、`static/js/dom.js`（initEl 进度条元素）、`static/js/webView.js`、
`static/style.css`、`src/webView.ts`、`src/treeView/Chapter.ts`（openThis 传 totalChapters）、
`src/test/suite/extension.test.ts`（进度纯函数冒烟）、`DEVELOPMENT_PLAN.md`、`CHANGELOG.md`。

## Phase gate 状态

- [x] 首章/末章/空章/单章计算正确（progressBar 单测）。
- [x] resize/zoom 场景：进度公式不依赖像素绝对值（chapterProgress 为比例），布局变化后仍正确。
- [x] 自动滚屏：scroll 事件经 debounce + rAF 合并，每帧最多一次 DOM 写。
- [x] 单测 170 → 180（进度 10）；集成测试 +1。
