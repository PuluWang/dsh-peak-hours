# dsh-peak-hours · 高峰时段计费提醒

一个给 DeepSeek Harness（DSH）Web 客户端用的纯前端小插件：**工作日高峰时段提醒你「花费 ×2」**，并倒数距离空闲时段还有多久。

> **非官方项目。** 与 DeepSeek 无隶属或背书关系，只是使用 DSH 公开的插件协议。价格与时段以官方页面为准。

## 状态

- 代码只使用浏览器 API（`window` / `document` / `localStorage` / `Date`），无原生依赖、无文件路径，**Windows / macOS / Linux 共用同一份 `client.js`**。
- **Windows 桌面版已实测**：装进 `desktop` profile 后重启客户端，右下角正常出现提醒浮层，宿主能把它加载进浏览器名册。
- **macOS 尚未实测**，代码里没有任何平台相关调用，预期一致；有 Mac 环境的话欢迎反馈。
- 时段判定、周末/节假日、倒计时、拖动定位经过两轮静态复查，尚未补充自动化测试。
- 面向 DSH 现有客户端组合协议（`dsh.client` + `window.__ModuleLoader__` + `cordis.patch.yml`），未做跨大版本兼容。

## 计费口径

依据 DeepSeek 官方 [模型 & 价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)：

> 空闲时段价格为高峰时段价格的一半。北京时间周一至周五（不含中国法定节假日）9:00–12:00、14:00–18:00 为高峰时段；其余时段，包括周末及中国法定节假日全天均为空闲时段。

以 `deepseek-flash` 为例（元 / 百万 tokens）：

| | 空闲 | 高峰 |
| --- | --- | --- |
| 输入（缓存命中） | 0.02 | 0.04 |
| 输入（缓存未命中） | 1 | 2 |
| 输出 | 4 | 8 |

所以「高峰 = 花费 ×2」成立，**但高峰不是全天**：

- 高峰：**周一至周五 09:00–12:00、14:00–18:00**（北京时间），法定节假日除外
- 空闲（5 折）：工作日其余时间 + **周末全天** + **法定节假日全天**

如果你走的是第三方中转、代理或别的计费体系，这个提醒就不适用。

## 效果

高峰时段（默认展开，橙色）：

```
● 高峰时段 · 花费 ×2                                    –
  现在是工作日高峰（北京时间 09:00–12:00、14:00–18:00），
  token 花费是空闲时段的 2 倍。
  距空闲（5 折）还有 45 分钟
  高峰 周一至周五 09:00–12:00、14:00–18:00
  空闲 其余时段 · 周末与法定节假日全天
                                        本时段不再提示
```

点右上角 `–` 最小化：卡片以右下角为原点缩小淡出，收成一颗胶囊 **`● 花费 ×2`**。胶囊上**点文字**展开，**点边框**是拖动，两种操作不会互相误伤。

倒计时下方有一个勾选项 **「启用提醒（随客户端打开）」**（默认勾选）。**取消勾选 = 彻底关掉提醒**：卡片和胶囊都消失，客户端重启后也不会再出现。想重新打开，按 **`Alt + Shift + P`**（插件一直在后台监听这个快捷键），或者在浏览器里清掉 `dsh_peak_hours_auto_open` 这个 cookie。

**位置随你拖**：按住胶囊边框或卡片标题栏（`cursor: grab`）拖到任意位置，松手即记住，下次打开还在原地；**双击标题栏**（收起时先用文字点开）恢复默认的右下角。展开/收起时浮层以右下角为锚点，不会因为变宽而跑出屏幕；窗口缩小也会自动夹回可视区。

| 操作 | 行为 |
| --- | --- |
| `–` | 最小化，显示「花费 ×2」胶囊 |
| 点胶囊文字 | 展开卡片 |
| 勾选「启用提醒」 | 显示提醒，并在启动、时段切换时自动展开 |
| 取消勾选 | 彻底隐藏（无卡片、无胶囊），重启后也不出现 |
| `Alt + Shift + P` | 重新打开被取消勾选的提醒 |
| 拖动胶囊边框 / 标题栏 | 移动位置，松手保存（拖到窗口外松手也不会卡住） |
| 双击标题栏 | 位置复位到右下角 |
| `本时段不再提示` | 本轮高峰内完全隐藏，进入空闲后自动恢复 |
| 存储 | Cookie `dsh_peak_hours_dismissed / _pos / _auto_open`（主），`localStorage` 同键（回退） |

动画在 `prefers-reduced-motion: reduce` 下自动关闭。

## 目录结构

```
dsh-peak-hours/
├── package.json        # dsh.bundle + dsh.client 声明，exports["./client"]
├── cordis.patch.yml    # 往组合树插一行，name 必须等于包名
├── index.js            # host 半侧：空实现，只为让包被扫描到
├── client.js           # 浏览器半侧：__ModuleLoader__ 懒工厂 + 原生 DOM 浮层
├── install-windows.ps1 # 一键安装 / 卸载（Windows）
├── install-macos.sh    # 一键安装 / 卸载（macOS / Linux）
├── LICENSE
└── README.md
```

## 安装

### 方式一：官方 CLI（推荐）

```bash
dsh plugin --profile <profile> add <插件目录>
```

`<profile>` 一般是 `desktop` 或 `web`，`<插件目录>` 是本仓库克隆下来的路径。装完**重启客户端**——包清单、exports、client 名册都在进程内缓存。

### 方式二：一键脚本

Windows（PowerShell 5.1+ / 7+）：

```powershell
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1 -Profile desktop
```

macOS / Linux：

```bash
PROFILE=desktop bash ./install-macos.sh
```

脚本做两件事，幂等、可逆：

1. 把本目录复制到 `~/.dsh/profiles/<profile>/node_modules/dsh-peak-hours`；
2. 在该 profile 的 `cordis.patch.yml` 末尾追加一段带 `# >>> dsh-peak-hours >>>` 标记的 `insert` 行。

不会动 profile 里的其他配置。介意脚本改配置的话，手动做这两步效果相同。

### 验证

1. 右下角出现卡片或胶囊；
2. DevTools Console 里 `document.getElementById('dsh-peak-hours-root')` 返回节点；
3. 在客户端地址后拼 `/plugins/dsh-peak-hours/client.js`（本机默认形如 `http://127.0.0.1:4722/plugins/dsh-peak-hours/client.js`）能返回源码。

## 卸载

```powershell
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1 -Profile desktop -Uninstall
```

```bash
PROFILE=desktop bash ./install-macos.sh --uninstall
```

或手动删掉 `node_modules/dsh-peak-hours`，再删掉 `cordis.patch.yml` 里那段标记块，重启。

## 配置

改 `client.js` 顶部 `CONFIG`：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `peakWindows` | `[{540,720},{840,1080}]` | 高峰窗口，**北京时间分钟数** |
| `peakMultiplier` | `2` | 高峰倍数，用于「花费 ×2」 |
| `offPeakDiscount` | `'5 折'` | 空闲折扣文案 |
| `holidayRanges` | 2026 全年 | 法定节假日区间（含首尾），全天算空闲 |
| `tickMs` | `10000` | 刷新间隔 |
| `margin` | `8` | 拖动/吸附时与视口边缘的最小距离（px） |

### 节假日需要每年维护

`holidayRanges` 目前只覆盖 2026 年（依据国务院办公厅《关于2026年部分节假日安排的通知》，国办发明电〔2025〕7号）。**国务院一般在每年 11 月发布次年安排**，届时在数组里按 `['2027-01-01','2027-01-03']` 的格式追加即可；没追加的年份，节假日会被当成普通工作日（显示为高峰）。

周末的「调休上班日」按官方文字仍属周末，插件按空闲处理。

## 改名 / Fork 注意

包名出现在三个地方，必须一致，否则宿主编不进浏览器名册：

1. `package.json` 的 `name`
2. `client.js` 里 `window.__ModuleLoader__.load({ id: '...' })`
3. `cordis.patch.yml` 里的 `name:` 和 `id:`

另外 `install-windows.ps1` / `install-macos.sh` 里的 `$PluginName` / `PLUGIN_NAME` 与标记文本也要同步。

## 隐私

- 不联网、无遥测、不读写会话内容，只读本机时间。
- 持久化只有三条偏好：隐藏截止时间、浮层位置、是否跟随客户端自动打开。**以 cookie（`dsh_peak_hours_*`，1 年）为主，`localStorage` 只做回退**——客户端每次启动端口都不同，纯 `localStorage` 会按 origin 隔离而丢失。
- 浮层是 `document.body` 下的一个 `position: fixed` 节点，随插件卸载一起移除。

## 实现要点

- **host 半侧是空插件**：`dsh-client-modules` 只扫描「已启用的 Loader 条目」，所以必须有一行 host row；`index.js` 只导出 `name` 与空的 `apply`。
- **client 半侧不用 React、不注册 slot**：在 `apply(ctx)` 里直接建浮层，不依赖任何 UI 包版本，也不会因为 slot 名字变化而崩。
- **判定全按北京时间**：真实时刻 +8h 换成「北京墙上时间」再读 `getUTC*`，周末/节假日/时段都按北京日历。
- **下一次切换靠逐分钟扫描**（最多 14 天，覆盖春节长假），比手写跨周末分支更不容易错。
- **最小化动画**用 CSS transition + `transform-origin: 100% 100%`，`visibility` 延迟隐藏避免不可见元素仍可被 Tab 聚焦。
- **拖动定位**：位置存的是「浮层右下角」的视口坐标，而不是 left/top，所以展开/收起、窗口缩放都以同一个角为锚点；拖动用 Pointer Events（鼠标、触屏、笔通用）并做指针捕获，超过 4px 才判定为拖动；胶囊内部再分出两个热区——文字展开、边框拖动，靠点击目标与 `e.detail` 区分（键盘 Enter/Space 的 `detail === 0` 也算展开）；松手时把右下角夹回视口内再落盘。
- 清理走 `ctx.effect(() => cleanup, label)`；无 `ctx.effect` 时退回 `beforeunload`。

## 已知边界

- 只在 **Web 客户端（含桌面端 Web 视图）** 生效；headless/TUI 没有 DOM，会静默不挂载。
- 节假日表是静态数据，不会自动更新。
- 官方若调整价格或时段，改 `peakWindows` / `peakMultiplier` / `offPeakDiscount` 即可，但需要手动跟进。

## License

[MIT](LICENSE) © SHANGHAI PULU NETWORK TECHNOLOGY CORPORATION LIMITED

**可免费商用**：MIT 允许在闭源商业产品中使用、修改、分发，只需保留版权声明和许可文本。
