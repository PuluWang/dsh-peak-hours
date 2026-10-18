/*!
 * dsh-peak-hours · DeepSeek Harness 高峰时段计费提醒（client bundle）
 *
 * 纯 JavaScript 客户端插件：无构建步骤、无第三方依赖、无操作系统相关 API。
 * 因此在 Windows / macOS / Linux 的 DSH Web 客户端里行为一致。
 *
 * 计费口径（官方，2026-10 核对）：
 *   https://api-docs.deepseek.com/zh-cn/quick_start/pricing
 *   空闲时段价格为高峰时段价格的一半（即高峰 = 2 倍花费）。
 *   北京时间 周一至周五（不含中国法定节假日）09:00–12:00、14:00–18:00 为高峰；
 *   其余时段，包括周末与法定节假日全天，均为空闲（5 折）。
 */
(function () {
  if (typeof window === 'undefined') return
  var boot = window.__ModuleLoader__
  if (!boot || typeof boot.load !== 'function') return

  boot.load({
    id: 'dsh-peak-hours',
    factory: function () {
      'use strict'

      /* ── 可调参数 ─────────────────────────────────────────────────────── */
      var CONFIG = {
        peakMultiplier: 2, // 高峰相对空闲的倍数（官方就是 2 倍）
        offPeakDiscount: '5 折', // 空闲折扣文案
        // 高峰窗口，北京时间分钟数：09:00–12:00、14:00–18:00
        peakWindows: [
          { start: 9 * 60, end: 12 * 60 },
          { start: 14 * 60, end: 18 * 60 }
        ],
        // 中国法定节假日（全天算空闲）。日期按北京时间，含首尾。
        // 2026 年依据国办发明电〔2025〕7号；2027 年公布后在此追加即可。
        holidayRanges: [
          ['2026-01-01', '2026-01-03'],
          ['2026-02-15', '2026-02-23'],
          ['2026-04-04', '2026-04-06'],
          ['2026-05-01', '2026-05-05'],
          ['2026-06-19', '2026-06-21'],
          ['2026-09-25', '2026-09-27'],
          ['2026-10-01', '2026-10-07']
        ],
        tickMs: 10000, // 界面刷新间隔
        margin: 8, // 拖动时与视口边缘的最小距离
        rootId: 'dsh-peak-hours-root',
        styleId: 'dsh-peak-hours-style',
        dismissKey: 'dsh-peak-hours:dismissed-until',
        posKey: 'dsh-peak-hours:position',
        autoOpenKey: 'dsh-peak-hours:auto-open'
      }

      var MINUTE = 60000
      var HOUR_MS = 3600000
      var DAY_MS = 86400000
      var BEIJING_OFFSET_MS = 8 * HOUR_MS
      var HOLIDAYS = buildHolidaySet(CONFIG.holidayRanges)

      /* ── 样式 ─────────────────────────────────────────────────────────── */
      var CSS = [
        '#dsh-peak-hours-root{',
        'position:fixed;right:18px;bottom:18px;z-index:2147483000;',
        'display:flex;flex-direction:column;align-items:flex-end;gap:8px;',
        'font:12.5px/1.55 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;',
        'color:#e7eaf0;text-align:left;--dph-ease:cubic-bezier(.22,1,.36,1);',
        '--dph-accent:#ff7a45;--dph-line:rgba(255,122,69,.38);--dph-pill:rgba(255,122,69,.15);',
        '--dph-card:rgba(26,21,18,.96);--dph-strong:#ffcfb4;--dph-muted:#a39a94}',
        '#dsh-peak-hours-root[data-state="off-peak"]{',
        '--dph-accent:#3ddc84;--dph-line:rgba(61,220,132,.34);--dph-pill:rgba(61,220,132,.13);',
        '--dph-card:rgba(18,23,21,.96);--dph-strong:#bff3d4;--dph-muted:#98a49e}',
        '#dsh-peak-hours-root *{box-sizing:border-box}',
        '#dsh-peak-hours-root .dph-dot{width:7px;height:7px;border-radius:50%;background:var(--dph-accent);',
        'box-shadow:0 0 0 3px color-mix(in srgb,var(--dph-accent) 22%,transparent);flex:none}',
        /* 胶囊：收起态才进入普通文档流，展开态绝对定位并淡出 */
        '#dsh-peak-hours-root .dph-pill{position:absolute;right:0;bottom:0;',
        'display:inline-flex;align-items:center;gap:7px;padding:6px 11px;',
        'border:1px solid var(--dph-line);border-radius:999px;background:var(--dph-pill);color:var(--dph-strong);',
        'font:inherit;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;',
        'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);',
        'box-shadow:0 6px 18px rgba(0,0,0,.35);white-space:nowrap;',
        'opacity:0;transform:scale(.9) translateY(4px);pointer-events:none;visibility:hidden;',
        'transition:opacity .16s ease,transform .22s var(--dph-ease),visibility 0s linear .22s}',
        '#dsh-peak-hours-root[data-expanded="false"] .dph-pill{position:static;',
        'opacity:1;transform:none;pointer-events:auto;visibility:visible;',
        'transition:opacity .16s ease,transform .22s var(--dph-ease),visibility 0s}',
        '#dsh-peak-hours-root .dph-pill:hover{transform:translateY(-1px)}',
        /* 文字是展开热区，边框/内边距留给拖动 */
        '#dsh-peak-hours-root .dph-pill-text{cursor:pointer;padding:2px 1px;margin:-2px -1px;border-radius:4px}',
        '#dsh-peak-hours-root .dph-pill-text:hover{background:rgba(255,255,255,.08);',
        'text-decoration:underline;text-underline-offset:2px}',
        /* 卡片：最小化时向 right/bottom 角缩小淡出 */
        '#dsh-peak-hours-root .dph-card{width:292px;padding:12px 13px 10px;border-radius:14px;',
        'border:1px solid var(--dph-line);border-left:3px solid var(--dph-accent);background:var(--dph-card);',
        'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 16px 40px rgba(0,0,0,.5);',
        'transform-origin:100% 100%;opacity:1;transform:none;visibility:visible;',
        'transition:opacity .16s ease,transform .24s var(--dph-ease),visibility 0s}',
        '#dsh-peak-hours-root[data-expanded="false"] .dph-card{position:absolute;right:0;bottom:0;',
        'opacity:0;transform:scale(.84) translateY(8px);pointer-events:none;visibility:hidden;',
        'transition:opacity .16s ease,transform .24s var(--dph-ease),visibility 0s linear .24s}',
        '#dsh-peak-hours-root .dph-head{display:flex;align-items:center;gap:7px;',
        'cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}',
        '#dsh-peak-hours-root .dph-title{flex:1 1 auto;font-weight:600;color:var(--dph-strong);letter-spacing:.01em}',
        '#dsh-peak-hours-root .dph-close{border:0;background:transparent;color:var(--dph-muted);cursor:pointer;',
        'font:inherit;font-size:14px;line-height:1;padding:1px 6px 3px;border-radius:6px}',
        '#dsh-peak-hours-root .dph-close:hover{background:rgba(255,255,255,.08);color:#fff}',
        '#dsh-peak-hours-root .dph-body{margin:7px 0 0;font-size:12px;color:#cfd4dc}',
        '#dsh-peak-hours-root .dph-meta{margin-top:7px;font-size:12px;font-weight:600;color:var(--dph-strong)}',
        '#dsh-peak-hours-root .dph-auto{display:flex;align-items:center;gap:6px;margin-top:7px;',
        'font-size:11px;color:var(--dph-muted);cursor:pointer;user-select:none;-webkit-user-select:none}',
        '#dsh-peak-hours-root .dph-auto input{width:12px;height:12px;margin:0;accent-color:var(--dph-accent);',
        'cursor:pointer;flex:none}',
        '#dsh-peak-hours-root .dph-win{margin-top:6px;font-size:11px;color:var(--dph-muted);',
        'display:flex;flex-direction:column;gap:1px;line-height:1.5}',
        '#dsh-peak-hours-root .dph-win span{white-space:nowrap}',
        '#dsh-peak-hours-root .dph-foot{display:flex;align-items:center;justify-content:flex-end;margin-top:9px;',
        'padding-top:8px;border-top:1px solid rgba(255,255,255,.07)}',
        '#dsh-peak-hours-root .dph-snooze{border:0;background:transparent;color:var(--dph-muted);cursor:pointer;',
        'font:inherit;font-size:11px;padding:2px 0;text-decoration:underline;text-underline-offset:2px}',
        '#dsh-peak-hours-root .dph-snooze:hover{color:var(--dph-strong)}',
        '#dsh-peak-hours-root button:focus-visible{outline:2px solid var(--dph-accent);outline-offset:2px}',
        /* 拖动中：光标与过渡 */
        '#dsh-peak-hours-root[data-dragging="true"]{transition:none}',
        '#dsh-peak-hours-root[data-dragging="true"] .dph-head,',
        '#dsh-peak-hours-root[data-dragging="true"] .dph-pill{cursor:grabbing}',
        '#dsh-peak-hours-root[data-dragging="true"] .dph-card{box-shadow:0 22px 54px rgba(0,0,0,.62)}',
        '@media (max-width:640px){#dsh-peak-hours-root{right:10px;bottom:10px}',
        '#dsh-peak-hours-root .dph-card{width:min(292px,calc(100vw - 20px))}}',
        '@media (prefers-reduced-motion:reduce){',
        '#dsh-peak-hours-root .dph-pill,#dsh-peak-hours-root .dph-card{transition:none}}'
      ].join('')

      /* ── 状态 ─────────────────────────────────────────────────────────── */
      var state = {
        root: null,
        timer: null,
        expanded: true, // 随客户端启动默认展开（受「跟随客户端自动打开」控制）
        autoOpen: readAutoOpen(), // 勾选后启动/切换时段自动展开
        lastMode: null, // 'peak' | 'off-peak'，用于时段切换时自动展开
        wasHidden: false, // 是否因为「本时段不再提示」被隐藏过
        dismissedUntil: readDismissed(),
        pos: readPos(), // null = 用默认右下角；否则 {x,y} 是浮层的右下角坐标
        suppressClick: false,
        pressOnText: false // 这次按下是否落在胶囊文字热区（指针捕获会改写 click.target）
      }
      state.expanded = state.autoOpen
      var drag = null

      /* 偏好存储：cookie + localStorage 双写。
         客户端每次启动端口会变（127.0.0.1:xxxx），localStorage 按 origin 隔离会丢，
         cookie 不区分端口，所以以 cookie 为准、localStorage 只做回退。 */
      var COOKIE_PREFIX = 'dsh_peak_hours_'

      function cookieGet(name) {
        var jar = typeof document !== 'undefined' && document.cookie ? document.cookie.split('; ') : []
        for (var i = 0; i < jar.length; i++) {
          var eq = jar[i].indexOf('=')
          if (eq > 0 && jar[i].slice(0, eq) === name) return decodeURIComponent(jar[i].slice(eq + 1))
        }
        return null
      }

      function prefGet(kind, lsKey) {
        var fromCookie = cookieGet(COOKIE_PREFIX + kind)
        if (fromCookie !== null) return fromCookie
        try {
          return window.localStorage.getItem(lsKey)
        } catch (e) {
          return null
        }
      }

      function prefSet(kind, lsKey, value) {
        var name = COOKIE_PREFIX + kind
        try {
          if (value === null) document.cookie = name + '=; path=/; max-age=0; SameSite=Lax'
          else
            document.cookie =
              name + '=' + encodeURIComponent(value) + '; path=/; max-age=31536000; SameSite=Lax'
        } catch (e) {
          /* cookie 被禁用时只用 localStorage */
        }
        try {
          if (value === null) window.localStorage.removeItem(lsKey)
          else window.localStorage.setItem(lsKey, value)
        } catch (e) {
          /* 同上 */
        }
      }

      function readDismissed() {
        var raw = prefGet('dismissed', CONFIG.dismissKey)
        var n = raw === null ? 0 : Number(raw)
        return isFinite(n) ? n : 0
      }

      function writeDismissed(ts) {
        prefSet('dismissed', CONFIG.dismissKey, ts > 0 ? String(ts) : null)
      }

      function readPos() {
        var raw = prefGet('pos', CONFIG.posKey)
        if (!raw) return null
        try {
          var p = JSON.parse(raw)
          if (!p || !isFinite(p.x) || !isFinite(p.y)) return null
          return { x: Number(p.x), y: Number(p.y) }
        } catch (e) {
          return null
        }
      }

      function writePos(p) {
        prefSet('pos', CONFIG.posKey, p ? JSON.stringify(p) : null)
      }

      function readAutoOpen() {
        var raw = prefGet('auto_open', CONFIG.autoOpenKey)
        if (raw === null) return true // 默认跟随客户端自动展开
        return raw !== '0'
      }

      function writeAutoOpen(on) {
        prefSet('auto_open', CONFIG.autoOpenKey, on ? '1' : '0')
      }

      /* ── 时间与计费判定（一律按北京时间，官方口径） ───────────────────── */
      function pad2(n) {
        return n < 10 ? '0' + n : String(n)
      }

      function buildHolidaySet(ranges) {
        var set = {}
        for (var i = 0; i < ranges.length; i++) {
          var from = Date.parse(ranges[i][0] + 'T00:00:00Z')
          var to = Date.parse(ranges[i][1] + 'T00:00:00Z')
          for (var t = from; t <= to; t += DAY_MS) {
            set[new Date(t).toISOString().slice(0, 10)] = true
          }
        }
        return set
      }

      /** 把真实时刻换成「北京墙上时间」，之后一律读 getUTC* 字段。 */
      function bj(now) {
        return new Date(now.getTime() + BEIJING_OFFSET_MS)
      }

      function bjDateKey(b) {
        return b.getUTCFullYear() + '-' + pad2(b.getUTCMonth() + 1) + '-' + pad2(b.getUTCDate())
      }

      function isPeakAt(now) {
        var b = bj(now)
        var day = b.getUTCDay()
        if (day === 0 || day === 6) return false // 周末全天空闲
        if (HOLIDAYS[bjDateKey(b)]) return false // 法定节假日全天空闲
        var m = b.getUTCHours() * 60 + b.getUTCMinutes()
        for (var i = 0; i < CONFIG.peakWindows.length; i++) {
          var w = CONFIG.peakWindows[i]
          if (m >= w.start && m < w.end) return true
        }
        return false
      }

      /** 下一次高峰/空闲切换的时刻（毫秒）。逐分钟扫描，最多看 14 天（覆盖春节长假）。 */
      function nextTransition(now) {
        var peakNow = isPeakAt(now)
        var t = now.getTime() - (now.getTime() % MINUTE) + MINUTE
        for (var i = 0; i < 14 * 1440; i++) {
          if (isPeakAt(new Date(t)) !== peakNow) return t
          t += MINUTE
        }
        return t
      }

      function localDayNumber(d) {
        return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate()
      }

      function clockOf(d) {
        return pad2(d.getHours()) + ':' + pad2(d.getMinutes())
      }

      /** 北京时间的某个整分，换算成访客本地的时间点。 */
      function bjInstant(bjMinute, now) {
        var b = bj(now)
        var bjMidnightUtc = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) - BEIJING_OFFSET_MS
        return new Date(bjMidnightUtc + bjMinute * MINUTE)
      }

      function rangeLabel(startMin, endMin, now) {
        var s = bjInstant(startMin, now)
        var e = bjInstant(endMin, now)
        var nextDay = localDayNumber(s) !== localDayNumber(e)
        return clockOf(s) + '–' + (nextDay ? '次日 ' : '') + clockOf(e)
      }

      function durationText(minutes) {
        var m = Math.max(0, Math.round(minutes))
        if (m < 1) return '不到 1 分钟'
        if (m >= 1440) {
          var days = Math.floor(m / 1440)
          var hours = Math.floor((m % 1440) / 60)
          return hours ? days + ' 天 ' + hours + ' 小时' : days + ' 天'
        }
        var h = Math.floor(m / 60)
        var rest = m % 60
        if (h === 0) return rest + ' 分钟'
        return rest === 0 ? h + ' 小时' : h + ' 小时 ' + rest + ' 分钟'
      }

      /* ── 位置：拖动 / 复位 ────────────────────────────────────────────── */
      function clamp(v, min, max) {
        if (max < min) return min
        return Math.min(Math.max(v, min), max)
      }

      /** 把右下角坐标换成 left/top，并夹在当前视口内。 */
      function applyPos(root) {
        if (!state.pos || !root) return
        if (root.style.display === 'none') return
        var w = root.offsetWidth
        var h = root.offsetHeight
        if (!w || !h) return
        state.pos.x = clamp(state.pos.x, CONFIG.margin + w, window.innerWidth - CONFIG.margin)
        state.pos.y = clamp(state.pos.y, CONFIG.margin + h, window.innerHeight - CONFIG.margin)
        root.style.left = state.pos.x - w + 'px'
        root.style.top = state.pos.y - h + 'px'
        root.style.right = 'auto'
        root.style.bottom = 'auto'
      }

      /** 展开/收起后保持右下角不动（缩放手感一致，也不会越界）。 */
      function keepAnchor(root, right, bottom) {
        if (!state.pos) return
        var w = root.offsetWidth
        var h = root.offsetHeight
        var left = clamp(right - w, CONFIG.margin, window.innerWidth - w - CONFIG.margin)
        var top = clamp(bottom - h, CONFIG.margin, window.innerHeight - h - CONFIG.margin)
        state.pos = { x: left + w, y: top + h }
        root.style.left = left + 'px'
        root.style.top = top + 'px'
        root.style.right = 'auto'
        root.style.bottom = 'auto'
        writePos(state.pos)
      }

      function resetPosition(root) {
        state.pos = null
        writePos(null)
        root.style.left = ''
        root.style.top = ''
        root.style.right = ''
        root.style.bottom = ''
      }

      function attachDrag(root, handle) {
        handle.addEventListener('pointerdown', function (e) {
          if (e.pointerType === 'mouse' && e.button !== 0) return
          var t = e.target
          if (t && t.closest && (t.closest('.dph-close') || t.closest('.dph-snooze'))) return

          var rect = root.getBoundingClientRect()
          drag = {
            id: e.pointerId,
            handle: handle,
            sx: e.clientX,
            sy: e.clientY,
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            moved: false
          }
          // 指针捕获会把 click 的 target 重定向到捕获元素上，
          // 所以这里先记下这次按下是不是落在文字热区里。
          state.pressOnText = !!(t && t.closest && t.closest('.dph-pill-text'))

          window.addEventListener('pointermove', onDragMove)
          window.addEventListener('pointerup', onDragEnd)
          window.addEventListener('pointercancel', onDragEnd)
          window.addEventListener('blur', onDragEnd)
        })

        // 双击复位只绑在标题栏：胶囊被点开后立即隐藏，第二次点击落不到它身上。
        if (handle.classList.contains('dph-head')) {
          handle.addEventListener('dblclick', function (e) {
            if (e.target && e.target.closest && e.target.closest('.dph-close')) return
            resetPosition(root)
          })
        }
      }

      function onDragMove(e) {
        if (!drag || e.pointerId !== drag.id || !state.root) return
        // 鼠标在窗口外松开时收不到 pointerup，这里用 buttons 兜底收尾
        if (e.pointerType !== 'touch' && e.buttons === 0) {
          onDragEnd(e)
          return
        }
        var dx = e.clientX - drag.sx
        var dy = e.clientY - drag.sy
        if (!drag.moved) {
          if (Math.abs(dx) + Math.abs(dy) < 4) return
          drag.moved = true
          state.root.setAttribute('data-dragging', 'true')
          // 真正开始拖动后才捕获指针：普通点击保持正常的目标元素，
          // 拖出窗口也能收到 pointerup。
          try {
            drag.handle.setPointerCapture(drag.id)
          } catch (err) {
            /* 不支持捕获时靠 blur / buttons 兜底 */
          }
        }
        var left = clamp(drag.left + dx, CONFIG.margin, window.innerWidth - drag.width - CONFIG.margin)
        var top = clamp(drag.top + dy, CONFIG.margin, window.innerHeight - drag.height - CONFIG.margin)
        state.root.style.left = left + 'px'
        state.root.style.top = top + 'px'
        state.root.style.right = 'auto'
        state.root.style.bottom = 'auto'
      }

      function onDragEnd(e) {
        if (!drag) return
        if (e && e.pointerId !== undefined && e.pointerId !== drag.id) return
        var moved = drag.moved
        var handle = drag.handle
        var pointerId = drag.id
        drag = null
        if (handle) {
          try {
            handle.releasePointerCapture(pointerId)
          } catch (err) {
            /* 没有捕获时忽略 */
          }
        }
        window.removeEventListener('pointermove', onDragMove)
        window.removeEventListener('pointerup', onDragEnd)
        window.removeEventListener('pointercancel', onDragEnd)
        window.removeEventListener('blur', onDragEnd)

        var root = state.root
        if (!root) return
        root.removeAttribute('data-dragging')

        if (moved) {
          var rect = root.getBoundingClientRect()
          state.pos = { x: rect.right, y: rect.bottom }
          writePos(state.pos)
          state.pressOnText = false
          state.suppressClick = true
          window.setTimeout(function () {
            state.suppressClick = false
          }, 60)
        }
      }

      /* ── 视图 ─────────────────────────────────────────────────────────── */
      function ensureStyle() {
        if (document.getElementById(CONFIG.styleId)) return
        var style = document.createElement('style')
        style.id = CONFIG.styleId
        style.textContent = CSS
        ;(document.head || document.documentElement).appendChild(style)
      }

      function buildRoot() {
        var stale = document.getElementById(CONFIG.rootId)
        if (stale && stale.parentNode) stale.parentNode.removeChild(stale)

        var root = document.createElement('div')
        root.id = CONFIG.rootId
        root.dataset.state = 'peak'
        root.dataset.expanded = 'true'
        root.innerHTML = [
          '<button type="button" class="dph-pill" aria-expanded="false" title="拖动边框移动位置 · 点击文字展开">',
          '<span class="dph-dot" aria-hidden="true"></span>',
          '<span class="dph-pill-text"></span>',
          '</button>',
          '<div class="dph-card" role="note">',
          '<div class="dph-head" title="拖动移动位置 · 双击复位">',
          '<span class="dph-dot" aria-hidden="true"></span>',
          '<span class="dph-title"></span>',
          '<button type="button" class="dph-close" aria-label="最小化" title="最小化">–</button>',
          '</div>',
          '<p class="dph-body"></p>',
          '<div class="dph-meta"></div>',
          '<label class="dph-auto" title="取消勾选会完全隐藏提醒；按 Alt+Shift+P 可以重新打开">',
          '<input type="checkbox" class="dph-auto-input">',
          '<span>启用提醒（随客户端打开）</span>',
          '</label>',
          '<div class="dph-win">',
          '<span class="dph-win-peak"></span>',
          '<span class="dph-win-off"></span>',
          '</div>',
          '<div class="dph-foot">',
          '<button type="button" class="dph-snooze">本时段不再提示</button>',
          '</div>',
          '</div>'
        ].join('')

        var pill = root.querySelector('.dph-pill')
        var head = root.querySelector('.dph-head')

        attachDrag(root, pill)
        attachDrag(root, head)

        pill.addEventListener('click', function (e) {
          if (state.suppressClick) return
          // 只有点中胶囊文字（或键盘 Enter/Space，detail === 0）才展开；
          // 点边框、圆点视为拖动起点，不触发展开。
          // 指针捕获可能把 click 的 target 改写成 <button>，所以同时看按下时记录的热区。
          var onText =
            state.pressOnText ||
            !!(e.target && e.target.closest && e.target.closest('.dph-pill-text'))
          state.pressOnText = false
          if (!onText && e.detail !== 0) return
          var before = root.getBoundingClientRect()
          state.expanded = true
          render(root)
          keepAnchor(root, before.right, before.bottom)
        })

        root.querySelector('.dph-close').addEventListener('click', function () {
          var before = root.getBoundingClientRect()
          state.expanded = false
          render(root)
          keepAnchor(root, before.right, before.bottom)
        })

        var autoInput = root.querySelector('.dph-auto-input')
        autoInput.checked = state.autoOpen
        autoInput.addEventListener('change', function () {
          state.autoOpen = !!autoInput.checked
          writeAutoOpen(state.autoOpen)
          state.expanded = state.autoOpen
          render(root)
        })

        root.querySelector('.dph-snooze').addEventListener('click', function () {
          var now = new Date()
          if (isPeakAt(now)) {
            state.dismissedUntil = nextTransition(now)
            writeDismissed(state.dismissedUntil)
          } else {
            state.expanded = false
          }
          render(root)
        })

        return root
      }

      function render(root) {
        if (!state.autoOpen) {
          // 取消勾选 = 彻底不显示（连胶囊也不出现），只能靠 Alt+Shift+P 重新打开
          root.style.display = 'none'
          return
        }
        var now = new Date()
        var peak = isPeakAt(now)
        var remainMin = Math.max(0, Math.round((nextTransition(now) - now.getTime()) / MINUTE))

        if (state.dismissedUntil > now.getTime()) {
          root.style.display = 'none'
          state.wasHidden = true
          return
        }
        root.style.display = ''
        if (state.wasHidden) {
          state.wasHidden = false
          if (state.autoOpen) state.expanded = true
        }

        var mode = peak ? 'peak' : 'off-peak'
        if (state.lastMode !== mode) {
          state.lastMode = mode
          if (state.autoOpen) state.expanded = true // 时段切换时自动弹开，提示当前计价
        }

        root.dataset.state = mode
        root.dataset.expanded = String(state.expanded)

        var peakLabel =
          rangeLabel(CONFIG.peakWindows[0].start, CONFIG.peakWindows[0].end, now) +
          '、' +
          rangeLabel(CONFIG.peakWindows[1].start, CONFIG.peakWindows[1].end, now)

        var title
        var body
        var meta
        var pillText
        var winOff
        if (peak) {
          title = '高峰时段 · 花费 ×' + String(CONFIG.peakMultiplier)
          body =
            '现在是工作日高峰（北京时间 09:00–12:00、14:00–18:00），token 花费是空闲时段的 ' +
            String(CONFIG.peakMultiplier) +
            ' 倍。'
          meta = '距空闲（' + CONFIG.offPeakDiscount + '）还有 ' + durationText(remainMin)
          pillText = '花费 ×' + String(CONFIG.peakMultiplier)
          winOff = '空闲 其余时段 · 周末与法定节假日全天'
        } else {
          title = '空闲时段 · 花费 ' + CONFIG.offPeakDiscount
          body = '空闲时段价格是高峰的一半；工作日其余时段、周末和法定节假日全天都算空闲。'
          meta = '距高峰还有 ' + durationText(remainMin)
          pillText = '花费 ' + CONFIG.offPeakDiscount
          winOff = '空闲 工作日其余时段 · 周末与法定节假日全天'
        }

        root.querySelector('.dph-title').textContent = title
        root.querySelector('.dph-body').textContent = body
        root.querySelector('.dph-meta').textContent = meta
        root.querySelector('.dph-auto-input').checked = state.autoOpen
        root.querySelector('.dph-pill-text').textContent = pillText
        root.querySelector('.dph-win-peak').textContent = '高峰 周一至周五 ' + peakLabel
        root.querySelector('.dph-win-off').textContent = winOff
        root.querySelector('.dph-snooze').style.display = peak ? '' : 'none'

        var pill = root.querySelector('.dph-pill')
        pill.setAttribute('aria-expanded', root.dataset.expanded)

        if (state.pos && !drag) applyPos(root)
      }

      /* ── 挂载 / 卸载 ──────────────────────────────────────────────────── */
      function onResize() {
        if (!state.root || !state.pos || drag) return
        applyPos(state.root)
        writePos(state.pos)
      }

      /** Alt+Shift+P：重新打开被勾选关闭的提醒。 */
      function onKeyDown(e) {
        if (!e.altKey || !e.shiftKey) return
        if (e.code !== 'KeyP' && e.key !== 'P' && e.key !== 'p') return
        e.preventDefault()
        state.autoOpen = true
        state.expanded = true
        writeAutoOpen(true)
        if (state.root) render(state.root)
      }

      function mount() {
        ensureStyle()
        var root = buildRoot()
        ;(document.body || document.documentElement).appendChild(root)
        state.root = root
        render(root)
        if (state.pos) applyPos(root)
        window.addEventListener('resize', onResize)
        window.addEventListener('keydown', onKeyDown)
        state.timer = window.setInterval(function () {
          if (state.root) render(state.root)
        }, CONFIG.tickMs)
      }

      function unmount() {
        if (state.timer) {
          window.clearInterval(state.timer)
          state.timer = null
        }
        window.removeEventListener('resize', onResize)
        window.removeEventListener('keydown', onKeyDown)
        window.removeEventListener('pointermove', onDragMove)
        window.removeEventListener('pointerup', onDragEnd)
        window.removeEventListener('pointercancel', onDragEnd)
        window.removeEventListener('blur', onDragEnd)
        drag = null
        if (state.root && state.root.parentNode) {
          state.root.parentNode.removeChild(state.root)
        }
        state.root = null
        var style = document.getElementById(CONFIG.styleId)
        if (style && style.parentNode) style.parentNode.removeChild(style)
      }

      function apply(ctx) {
        if (typeof document === 'undefined') return
        try {
          mount()
        } catch (err) {
          if (window.console) console.warn('[dsh-peak-hours] mount failed', err)
          return
        }
        var cleanup = function () {
          try {
            unmount()
          } catch (e) {
            /* 忽略卸载期异常 */
          }
        }
        if (ctx && typeof ctx.effect === 'function') {
          ctx.effect(function () {
            return cleanup
          }, 'dsh-peak-hours: floating billing reminder')
        } else {
          window.addEventListener('beforeunload', cleanup)
        }
      }

      return { name: 'dsh-peak-hours', apply: apply }
    }
  })
})()
