/*! Resonance lite — plain lesson text to Exploragram HTML. No build or dependencies. */
(function (root) {
  'use strict';

  var DEFAULT_ENGINE = 'https://cdn.jsdelivr.net/gh/N-lifescience/resonance@2/engine/';
  var GRID = 'display:grid;grid-template-columns:600px 1fr;gap:28px;align-items:start';
  var RESERVED = ('abs min max round floor ceil sqrt pow exp ln log sin cos tan asin acos atan rad deg clamp if fix len sign pi e true false x constructor prototype __proto__').split(' ');
  var TEMPLATES = { '끌려가기': 'drift', '고르기': 'choice', '전자 이동': 'electron', '그래프': 'graph', '퍼지기': 'diffusion', '단계': 'stages', '퀴즈': 'quiz', '분류': 'sort', '순서': 'order' };
  var COLORS = { '파랑': '#2563EB', '빨강': '#DC2626', '주황': '#B45309', '초록': '#15803D', '보라': '#7C3AED', '회색': '#6B7280' };
  var LITE_CSS = [
    '.slide{word-break:keep-all;overflow-wrap:anywhere}',
    '.lite-body,.lite-cols>*,.lite-model>*{min-width:0}',
    '.lite-cols{display:grid;grid-template-columns:minmax(0,1fr) 440px;gap:28px;align-items:start}',
    '.lite-pictures{display:grid;gap:16px;align-content:start}',
    '.lite-pictures.lite-many{grid-template-columns:repeat(2,minmax(0,1fr))}',
    '.fig img[hidden]{display:none !important}',
    '.lite-pictures .fig,.lite-figure-only .fig{width:100%}',
    '.lite-pictures .fig img,.lite-pictures .ch-ppt-ph{max-height:300px;width:100%;object-fit:contain;box-sizing:border-box}',
    '.lite-pictures.lite-two .fig img,.lite-pictures.lite-two .ch-ppt-ph{height:180px;max-height:200px}',
    '.lite-pictures.lite-many .fig img,.lite-pictures.lite-many .ch-ppt-ph{max-height:150px}',
    '.lite-figure-only{display:flex;justify-content:center;gap:24px}',
    '.lite-figure-only .fig{display:flex;flex-direction:column;max-width:900px;max-height:460px}',
    '.lite-figure-only .fig img,.lite-figure-only .ch-ppt-ph{min-height:0;flex-shrink:1}',
    '.lite-figure-only figcaption{flex-shrink:0}',
    '.lite-figure-only .fig img,.lite-figure-only .ch-ppt-ph{max-height:460px;width:100%;object-fit:contain;box-sizing:border-box}',
    '.lite-model{margin:0}',
    '.lite-model svg{display:block;width:600px;height:340px;max-width:100%;overflow:visible}',
    '.lite-model p{margin:0 0 12px;font-size:26px;line-height:1.45}',
    '.lite-model .q{font-size:28px;padding-left:0;margin-bottom:16px}',
    '.lite-buttons{display:flex;flex-wrap:wrap;margin-bottom:4px}',
    '.lite-buttons>button{margin:0 8px 8px 0}',
    '.lite-model button{font:600 22px/1.3 var(--ch-font,sans-serif);white-space:normal;min-height:56px;padding:10px 14px}',
    '.lite-model .ch-stops{margin-top:12px}',
    '.lite-electron .lite-buttons>button{margin:0 6px 6px 0}',
    '.lite-electron button{padding:8px 12px}',
    '.lite-stages .fig img,.lite-stages .ch-ppt-ph{max-height:280px;object-fit:contain}',
    '.lite-stages>p{margin-bottom:12px}',
    '.lite-stages .fig{max-width:600px}',
    '.lite-measure{position:fixed;left:-20000px;top:0;width:1280px;height:720px;visibility:hidden;pointer-events:none}',
    '.lite-measure .slide{display:block !important;position:relative;width:1280px;height:720px;overflow:visible;animation:none;transform:none}',
    '.lite-measure .step{transform:none}',
    '@media print{.lite-measure{display:none}}'
  ].join('\n');

  function esc(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function attr(name, value) { return ' ' + name + '="' + esc(value) + '"'; }
  // Escape before applying our three inline marks; user HTML is never interpreted.
  function inline(value) {
    return esc(value).replace(/\{([^{}]+)\}/g, '<span class="blank">$1</span>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/==([^=]+)==/g, '<mark>$1</mark>');
  }
  function normalize(line) {
    var from = '＃－＞［］｜＊：＝';
    var to = '#->[]|*:=';
    return line.replace(/[＃－＞［］｜＊：＝]/g, function (c) { return to.charAt(from.indexOf(c)); }).trim();
  }
  function pipes(text) { return text.split('|').map(function (s) { return s.trim(); }); }
  function unbullet(text) { return text.replace(/^[-*•·]\s*/, '').trim(); }
  function hash(text) {
    var n = 2166136261;
    for (var i = 0; i < text.length; i++) n = Math.imul(n ^ text.charCodeAt(i), 16777619);
    return n >>> 0;
  }
  function deckKey(title) { return 'lite-' + ('000000' + hash(title).toString(36)).slice(-6); }
  function shuffled(items, seed) {
    var copy = items.slice();
    var n = hash(seed) || 1;
    for (var i = copy.length - 1; i > 0; i--) {
      n ^= n << 13; n ^= n >>> 17; n ^= n << 5;
      var j = (n >>> 0) % (i + 1);
      var t = copy[i]; copy[i] = copy[j]; copy[j] = t;
    }
    return copy;
  }
  function activityLine(type, text) {
    var s = unbullet(text);
    var allowed = {
      drift: /^(왼쪽|오른쪽|켜기|고르기|처음|끝)\s*:/,
      choice: /^(값|그림)\s*:/,
      graph: /^(가로|세로|식|고르기|문장)\s*:/,
      diffusion: /^막\s*:/
    };
    if (allowed[type] && allowed[type].test(text)) return true;
    if (!/^[-*•·]/.test(text)) return false;
    if (type === 'electron') return /^\S+\s+\S+\s+\d+\s+(잃음|얻음)\s+\d+$/.test(s);
    if (type === 'diffusion') return /^\S+\s+\d+\s+\d+\s+(통과|막힘)\s+\S+$/.test(s);
    if (type === 'choice') return /^.+?\s*=\s*.+/.test(s);
    if (type === 'sort') return /^.+?\s*=\s*.+/.test(s);
    return ['quiz', 'order', 'stages'].indexOf(type) >= 0;
  }
  // '[그림 7-4] 설명', '- 그림 6-1, 6-2, 6-5: 설명', '그림 9-3~9-8: 설명', '(그림 19-9·19-13) 설명'을 모두 그림 자리로 읽는다.
  // 한 줄에서 그림은 4개까지만 받는다(장이 넘치지 않게).
  function figureRefs(line) {
    var m = /^(?:[-*•·]\s*)?[\[(（]?\s*그림\s*(\d+\s*-\s*\d+(?:\s*(?:,|·|~|및|와|과)\s*\d+(?:\s*-\s*\d+)?)*)\s*[\])）]?\s*[:：]?\s*(.*)$/.exec(line);
    if (!m) return null;
    var refs = [];
    m[1].replace(/\s+/g, '').split(/,|·|및|와|과/).forEach(function (token) {
      var r = /^(\d+)-(\d+)~(?:(\d+)-)?(\d+)$/.exec(token);
      if (r && (!r[3] || r[3] === r[1])) {
        for (var k = Number(r[2]); k <= Number(r[4]) && refs.length < 4; k++) refs.push(r[1] + '-' + k);
      } else if (/^\d+-\d+$/.test(token)) refs.push(token);
    });
    if (!refs.length) return null;
    return { refs: refs.slice(0, 4), text: m[2].trim() };
  }

  function parseLesson(text) {
    var lesson = { settings: { accent: '', deck: '' }, slides: [], warnings: [] };
    var lines = String(text == null ? '' : text).replace(/^\uFEFF/, '').split(/\r\n?|\n/).map(normalize);
    var current = null;
    var section = '';
    function newSlide(title, type) {
      current = { id: 's' + (lesson.slides.length + 1), title: title, type: type || 'normal', section: section, blocks: [] };
      lesson.slides.push(current);
      return current;
    }
    function add(block) {
      if (!current) newSlide('수업');
      current.blocks.push(block);
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var m;
      if (!line) continue;
      if ((m = /^\[묶음\]\s*(.*)$/.exec(line))) { section = m[1]; continue; }
      // 약한 모델은 '색:'을 빼고 '#568A35'만 쓰거나 '색 568A35'로 쓴다. 장 제목으로 읽지 않는다.
      if ((m = /^(?:(?:주\s*)?색\s*:?\s*)?#?([\da-f]{6}|[\da-f]{3})$/i.exec(line)) && (/^#[\da-f]+$/i.test(line) || /색/.test(line))) {
        lesson.settings.accent = '#' + m[1];
        continue;
      }
      var figs = figureRefs(line);
      if (figs) {
        if (current && current.type !== 'normal') continue;   // 표지·장표지에 그림 자리를 넣으면 제목이 밀려난다
        figs.refs.forEach(function (ref, k) { add({ type: 'figure', ppt: ref, text: figs.text || '그림 ' + ref, line: i + 1 }); });
        continue;
      }
      // 약한 모델은 활동·모형을 '# [퀴즈] 물음'처럼 장 제목 줄에 붙여 쓴다. 장을 만들고 그 줄을 활동 머리로 다시 읽는다.
      if ((m = /^#\s*\[([^\]]+)\]\s*(.*)$/.exec(line)) && Object.prototype.hasOwnProperty.call(TEMPLATES, m[1])) {
        var kind = TEMPLATES[m[1]], rest = m[2].trim();
        var defaults = { quiz: '확인 문제', sort: '나누어 보자', order: '순서대로 놓아 보자', drift: '어느 쪽으로 끌려갈까?', choice: '골라서 비교해 보자', electron: '원자는 어떻게 이온이 될까?', graph: '어떻게 변할까?', diffusion: '어떻게 퍼질까?', stages: '과정을 따라가 보자' };
        var activity = kind === 'quiz' || kind === 'sort' || kind === 'order';
        // 다음 줄에 같은 활동 머리('[분류] 칸1 | 칸2')가 또 오면 제목 줄은 제목으로만 쓴다.
        var next = i + 1; while (next < lines.length && !lines[next]) next++;
        if (next < lines.length && lines[next].indexOf('[' + m[1] + ']') === 0) {
          newSlide(rest && !/\|/.test(rest) ? rest : defaults[kind], 'normal');
          continue;
        }
        // 물음은 장 제목으로 쓴다(활동 안의 물음 줄은 그리지 않아 높이를 아낀다). '칸1 | 칸2'는 제목이 아니다.
        newSlide(!rest || /\|/.test(rest) ? defaults[kind] : rest, 'normal');
        lines[i] = '[' + m[1] + '] ' + (activity || kind === 'stages' || /\|/.test(rest) ? rest : '');
        i--;
        continue;
      }
      if ((m = /^#\s*(?:\[(표지|장표지)\]\s*)?(.*)$/.exec(line))) {
        if (m[1] === '장표지') section = m[2];
        newSlide(m[2], m[1] === '표지' ? 'cover' : m[1] === '장표지' ? 'chapter' : 'normal');
        continue;
      }
      if (!current && (m = /^(색|덱)\s*:\s*(.*)$/.exec(line))) {
        if (m[1] === '덱') lesson.settings.deck = m[2];
        else if (/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(m[2])) lesson.settings.accent = m[2];
        else lesson.warnings.push({ line: i + 1, message: '색은 #RGB 또는 #RRGGBB로 쓴다.' });
        continue;
      }
      if (current && current.type === 'cover') {
        if (!current.blocks.length) current.blocks.push({ type: 'kicker', text: unbullet(line), line: i + 1 });
        continue;
      }
      if (current && current.type === 'chapter') continue;
      if ((m = /^\[([^\]]+)\]\s*(.*)$/.exec(line)) && Object.prototype.hasOwnProperty.call(TEMPLATES, m[1])) {
        var block = { type: TEMPLATES[m[1]], text: m[2], source: line, lines: [], line: i + 1 };
        // 물음이 장 제목과 같으면 활동 안에서 물음 줄을 다시 그리지 않는다.
        block.asTitle = !!(current && block.text && current.title === block.text);
        var unknown = [];
        while (i + 1 < lines.length && lines[i + 1] && !/^(#|\[[^\]]+\])/.test(lines[i + 1])) {
          i++;
          if (activityLine(block.type, lines[i])) block.lines.push({ text: lines[i], line: i + 1 });
          else {
            unknown.push({ type: 'paragraph', text: lines[i], line: i + 1 });
            lesson.warnings.push({ line: i + 1, message: '활동 문법을 알 수 없어 문단으로 표시한다: ' + lines[i] });
          }
        }
        // 보기·카드·항목이 2개 안 되는 퀴즈·분류·순서는 엔진이 오류로 알리므로 버린다.
        var listed = block.lines.filter(function (l) { return /^[-*•·]/.test(l.text); }).length;
        if ((['quiz', 'order'].indexOf(block.type) >= 0 && listed < 2) || (block.type === 'sort' && listed < 1)) lesson.warnings.push({ line: block.line, message: '보기·카드·항목이 2개보다 적어 활동을 뺐다: ' + block.source });
        else add(block);
        unknown.forEach(add);
      } else if (/^\|/.test(line)) {
        var rows = [];
        var start = i + 1;
        do {
          var cells = pipes(lines[i].replace(/^\|/, '').replace(/\|$/, ''));
          if (!cells.every(function (c) { return /^:?-{3,}:?$/.test(c); })) rows.push(cells);
          i++;
        } while (i < lines.length && /^\|/.test(lines[i]));
        i--;
        if (rows.length) add({ type: 'table', rows: rows, line: start });
      } else if ((m = /^\[그림\s+([^\]]+)\]\s*(.*)$/.exec(line))) {
        add({ type: 'figure', ppt: m[1], text: m[2] || '그림 ' + m[1], line: i + 1 });
      } else if ((m = /^\[영상\]\s*(.*)$/.exec(line)) && /^https?:\/\//i.test(m[1])) {
        // 엔진 영상 카드는 유튜브만 튼다. 유튜브 영상 ID(11자)가 있으면 영상 카드, 다른 주소면 링크 카드.
        // 약한 모델은 'watch?v='처럼 빈 유튜브 주소를 쓴다. 그런 줄은 버리고 경고만 남긴다.
        var video = pipes(m[1]);
        var isYoutube = /(?:youtube\.com|youtu\.be)\//i.test(video[0]);
        var vid = /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})(?![\w-])/.exec(video[0]);
        if (vid) add({ type: 'video', url: video[0], text: video[1] || '영상', line: i + 1 });
        else if (!isYoutube) add({ type: 'link', url: video[0], text: video[1] || '자료 보기', line: i + 1 });
        else lesson.warnings.push({ line: i + 1, message: '영상 주소를 읽지 못해 영상 카드를 만들지 않았다: ' + video[0] });
      } else if ((m = /^\[(꼬리표|AI)\]\s*(.*)$/.exec(line))) {
        add({ type: m[1] === 'AI' ? 'ai' : 'kicker', text: m[2], line: i + 1 });
      } else if ((m = /^(?:답\s*:|A\.)\s*(.*)$/.exec(line))) {
        add({ type: 'answer', text: m[1], line: i + 1 });
      } else if ((m = /^Q(?:\.\s*|\s+)(.*)$/.exec(line))) {
        add({ type: 'question', text: m[1], line: i + 1 });
      } else if ((m = /^(?:->|→|>)\s*(.*)$/.exec(line))) {
        add({ type: 'step', text: m[1], line: i + 1 });
      } else add({ type: 'paragraph', text: unbullet(line), line: i + 1 });
    }
    return lesson;
  }

  function fields(block) {
    var values = Object.create(null);
    block.lines.forEach(function (l) {
      var m = /^([^:]+):\s*(.*)$/.exec(l.text);
      if (m) {
        var key = m[1].trim();
        if (!Object.prototype.hasOwnProperty.call(values, key)) values[key] = [];
        values[key].push(m[2]);
      }
    });
    return values;
  }
  function first(f, key, fallback) { return f[key] && f[key].length ? f[key][0] : fallback; }
  function items(block) { return block.lines.filter(function (l) { return /^[-*•·]/.test(l.text); }); }
  function output(expr, unit, digits) {
    return '<output' + attr('data-expr', expr) + (unit ? attr('data-unit', unit) : '') + (digits == null ? '' : attr('data-digits', digits)) + '></output>';
  }
  function button(name, value, label, pressed) {
    return '<button type="button"' + attr('data-set', name) + attr('data-value', value) + (pressed ? ' aria-pressed="true"' : '') + '>' + inline(label) + '</button>';
  }
  function buttons(name, labels) {
    return '<div class="lite-buttons">' + labels.map(function (label, i) { return button(name, i + 1, label, i === 0); }).join('') + '</div>';
  }
  function selectExpr(name, values) {
    if (!values.length) return '0';
    return values.map(function (value, i) { return i === values.length - 1 ? value : name + ' == ' + (i + 1) + ' ? ' + value + ' : '; }).join('');
  }
  // Engine strings have no backslash escapes. Use concatenated single/double
  // quoted pieces so names containing either quote still remain plain data.
  function quoted(text) {
    return String(text).replace(/[\r\n]/g, ' ').split(/(['"])/).map(function (piece) {
      return piece === "'" ? '"\'"' : piece === '"' ? "'\"'" : "'" + piece + "'";
    }).join(' + ');
  }
  function svg(content, label) { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 340" role="img"' + attr('aria-label', label) + '>' + content + '</svg>'; }
  function svgText(x, y, text, extra) {
    return '<text' + attr('x', x) + attr('y', y) + ' text-anchor="middle" font-size="26" fill="#1F2328"' + (extra || '') + '>' + esc(text) + '</text>';
  }
  function model(type, lets, left, right, extra) {
    return '<div class="calc lite-model lite-' + type + '" data-ai="모형" data-activity' + attr('data-let', lets) + (extra || '') + attr('style', GRID) + '>' + left + '<div>' + right + '</div></div>';
  }
  function figure(ppt, text) {
    return '<figure class="fig"><img' + attr('data-ppt', ppt) + attr('alt', text) + '><figcaption>' + inline(text) + '</figcaption></figure>';
  }
  function fallback(block) {
    return '<p>' + inline(block.source || block.text) + '</p>' + (block.lines || []).map(function (l) { return '<p>' + inline(l.text) + '</p>'; }).join('');
  }

  // SVG 글자 폭 어림: 한글·한자는 글자 크기만큼, 영문·숫자는 0.6배, 위·아래첨자는 0.4배.
  function labelWidth(text, size) {
    var w = 0;
    String(text).split('').forEach(function (ch) {
      if (/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻₀₁₂₃₄₅₆₇₈₉]/.test(ch)) w += size * 0.4;
      else if (/[ᄀ-ᇿ㄰-㆏가-힯一-鿿]/.test(ch)) w += size * 0.95;
      else w += size * 0.6;
    });
    return w;
  }
  function renderDrift(block) {
    var f = fields(block);
    var choices = (f['고르기'] || []).map(function (line) {
      var m = /^(.*?)\s*=\s*(.*)$/.exec(line);
      if (!m) return null;
      var parts = m[2].split(',').map(function (part) {
        var p = /^(.+?)\s+(왼쪽|오른쪽|위|아래|그대로)\s+(\d+)$/.exec(part.trim());
        return p ? { name: p[1], dir: p[2], count: Number(p[3]) } : null;
      });
      return parts.length && parts.every(Boolean) ? { label: m[1], parts: parts } : null;
    }).filter(Boolean);
    if (!choices.length) return fallback(block);
    var dirColor = { '왼쪽': '#DC2626', '오른쪽': '#2563EB', '위': '#7C3AED', '아래': '#B45309', '그대로': '#6B7280' };
    var art = '<rect x="10" y="48" width="580" height="280" rx="16" fill="#EFF6FF" stroke="#94A3B8" stroke-width="2"/>';
    art += '<rect x="26" y="65" width="18" height="245" fill="#64748B"/><rect x="556" y="65" width="18" height="245" fill="#64748B"/>';
    art += svgText(90, 31, first(f, '왼쪽', '왼쪽')) + svgText(510, 31, first(f, '오른쪽', '오른쪽'));
    var nL = [], nR = [];
    choices.forEach(function (choice, ci) {
      var parts = [];
      choice.parts.forEach(function (p) { for (var k = 0; k < p.count; k++) parts.push(p); });
      var counts = { '왼쪽': 0, '오른쪽': 0, '위': 0, '아래': 0, '그대로': 0 };
      var totals = {};
      Object.keys(counts).forEach(function (dir) { totals[dir] = parts.filter(function (p) { return p.dir === dir; }).length; });
      nL.push(String(totals['왼쪽'])); nR.push(String(totals['오른쪽']));
      art += '<g' + attr('data-show', 'sol == ' + (ci + 1)) + '>';
      if (totals['위']) art += '<rect x="140" y="49" width="320" height="10" fill="#7C3AED"/>';
      if (totals['아래']) art += '<rect x="140" y="317" width="320" height="10" fill="#B45309"/>';
      var cols = Math.min(5, Math.max(1, Math.ceil(Math.sqrt(parts.length))));
      var rows = Math.ceil(parts.length / cols);
      parts.forEach(function (p, i) {
        // 이름이 길면(예: 지방산·모노글리세리드) 원 대신 글자 길이에 맞춘 둥근 상자로 그린다.
        var textW = labelWidth(p.name, 22);
        var pill = textW > 40;
        var half = pill ? Math.round(Math.min(150, textW / 2 + 12)) : 22;
        var x0 = cols === 1 ? 300 : 160 + (i % cols) * 280 / (cols - 1);
        x0 = Math.max(52 + half, Math.min(548 - half, x0));
        var y0 = rows === 1 ? 180 : 80 + Math.floor(i / cols) * 220 / (rows - 1);
        var at = counts[p.dir]++;
        var total = totals[p.dir];
        var x1 = x0, y1 = y0;
        if (p.dir === '왼쪽' || p.dir === '오른쪽') { x1 = p.dir === '왼쪽' ? 52 + half : 548 - half; y1 = 85 + at * 210 / Math.max(1, total - 1); }
        if (p.dir === '위' || p.dir === '아래') { x1 = Math.max(52 + half, Math.min(548 - half, 160 + at * 280 / Math.max(1, total - 1))); y1 = p.dir === '위' ? 85 : 285; }
        var ex = x0 + ' + (' + x1 + ' - ' + x0 + ') * p';
        var ey = y0 + ' + (' + y1 + ' - ' + y0 + ') * p';
        if (pill) art += '<rect height="40" rx="20"' + attr('width', 2 * half) + attr('fill', dirColor[p.dir]) + attr('data-attr', 'x: ' + ex + ' - ' + half + '; y: ' + ey + ' - 20') + '/>';
        else art += '<circle r="22"' + attr('fill', dirColor[p.dir]) + attr('data-attr', 'cx: ' + ex + '; cy: ' + ey) + '/>';
        art += '<text text-anchor="middle"' + attr('font-size', pill ? 20 : 22) + ' fill="white"' + attr('data-attr', 'x: ' + ex + '; y: ' + ey + ' + 8') + '>' + esc(p.name) + '</text>';
      });
      art += '</g>';
    });
    var lets = 'p = on * t; nL = round((' + selectExpr('sol', nL) + ') * p); nR = round((' + selectExpr('sol', nR) + ') * p)';
    var constants = [];
    var right = choices.length > 1 ? buttons('sol', choices.map(function (c) { return c.label; })) : '';
    if (choices.length === 1) constants.push('sol = 1');
    if (f['켜기']) {
      var label = first(f, '켜기', '전원');
      right += '<div class="lite-buttons">' + button('on', 0, label + ' 끔', true) + button('on', 1, label + ' 켬') + '</div>';
    } else constants.push('on = 1');
    right += '<input type="range" name="t" min="0" max="1" step="0.1" value="0" data-play="5" aria-label="시간">';
    right += '<p>' + inline(first(f, '왼쪽', '왼쪽')) + ' 쪽 ' + output('nL', '개') + ' · ' + inline(first(f, '오른쪽', '오른쪽')) + ' 쪽 ' + output('nR', '개') + ' (모형)</p>';
    right += '<p data-show="p == 0">' + inline(first(f, '처음', '아직 이동하지 않았다.')) + '</p><p data-show="p > 0 &amp;&amp; p &lt; 1">끌려가는 중이다.</p><p data-show="p == 1">' + inline(first(f, '끝', '입자가 끝에 도착했다.')) + '</p>';
    return model('drift', lets, svg(art, '방향에 따른 입자 이동 모형'), right, constants.length ? attr('data-const', constants.join('; ')) : '');
  }

  // 판정 말(통한다/통하지 않는다, 있다/없다, 켜진다/꺼진다)을 1/0으로 읽는다. 모르면 null.
  function verdict(text) {
    var s = String(text || '');
    if (/않|없|안\s|아니|꺼|못|×/.test(s)) return 0;
    if (/통한다|통함|난다|켜|있|흐른다|흐름|○/.test(s)) return 1;
    return null;
  }
  function renderChoice(block) {
    var f = fields(block);
    var choices = items(block).map(function (line) {
      var parts = pipes(unbullet(line.text));
      var m = /^(.*?)\s*=\s*(.+)$/.exec(parts[0]);
      if (!m) return null;
      var n = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(m[2].trim()) ? Number(m[2]) : verdict(m[2]);
      return n === null ? null : { label: m[1], value: n, text: parts.slice(1).join(' | ') || m[2], word: isNaN(Number(m[2])) };
    }).filter(Boolean);
    if (!choices.length) {
      // '= 기계적 소화'처럼 갈래 이름을 쓴 고르기는 분류 카드로 펼친다(약한 모델이 분류와 고르기를 섞는다).
      var cats = items(block).filter(function (l) { return /=/.test(l.text); });
      var parsed = cats.map(function (l) { var p = pipes(unbullet(l.text)); var m = /^(.*?)\s*=\s*(.*)$/.exec(p[0]); return { label: m[1], result: m[2], why: p.slice(1).join(' | ') }; });
      var distinct = parsed.filter(function (c, i) { return parsed.findIndex(function (d) { return d.result === c.result; }) === i; }).length;
      // 고를 때마다 결과가 하나씩 다르면(시험관 A = 녹말이 그대로다, B = 당분으로 바뀐다) 비교 전환으로 연다.
      var sentences = parsed.every(function (c) { return /다\.?$|\.$/.test(c.result.trim()); });
      if (cats.length >= 2 && distinct === cats.length && sentences) {
        return (block.text ? '<p class="q" data-n="?">' + inline(block.text) + '</p>' : '') + '<div class="switch"' + attr('data-stops', '시작|' + parsed.map(function (c) { return c.label.replace(/\|/g, ' '); }).join('|')) + '>' +
          parsed.map(function (c, i) { return '<div' + attr('data-only', i + 1) + '><p><b>' + inline(c.result) + '</b></p>' + (c.why ? '<p>' + inline(c.why) + '</p>' : '') + '</div>'; }).join('') + '</div>';
      }
      if (cats.length >= 2) return renderSort({ text: block.text, lines: cats });
      return fallback(block);
    }
    var value = pipes(first(f, '값', '값'));
    // 약한 모델이 값 자리에 번호(1, 2, 3…)를 쓰면 설탕물이 가장 밝은 전구처럼 틀린 모형이 된다.
    // 번호처럼 보이고 문장마다 판정이 있으면 문장의 판정(1/0)으로 바로잡는다.
    var numbered = choices.length >= 3 && choices.every(function (c, i) { return c.value === i + 1; });
    var judged = choices.map(function (c) { return verdict(c.text); });
    var onOff = choices.every(function (c) { return c.word; });
    if (numbered && judged.every(function (v) { return v !== null; })) {
      choices.forEach(function (c, i) { c.value = judged[i]; });
      onOff = true;
    }
    if (onOff) value = ['전기가 통하는 정도', ''];
    var max = Math.max.apply(null, choices.map(function (c) { return c.value; }).concat([0])) || 1;
    var lets = 'v = ' + selectExpr('c', choices.map(function (c) { return String(c.value); })) + '; m = ' + max;
    var art = '';
    var kind = first(f, '그림', '막대');
    if (kind === '전구') {
      art = '<path d="M230 150 H100 V290 H500 V150 H370 M270 290 V275 M270 305 V290 M300 265 V310" fill="none" stroke="#64748B" stroke-width="8"/><path d="M280 220 V242 H320 V220" fill="none" stroke="#64748B" stroke-width="12"/><circle cx="300" cy="145" r="70" fill="#FACC15" stroke="#92400E" stroke-width="4" data-attr="fill-opacity: 0.08 + 0.92 * v / m"/>';
      for (var i = 0; i < 8; i++) {
        var a = i * Math.PI / 4;
        art += '<line' + attr('x1', 300 + 90 * Math.cos(a)) + attr('y1', 145 + 90 * Math.sin(a)) + attr('x2', 300 + 112 * Math.cos(a)) + attr('y2', 145 + 112 * Math.sin(a)) + ' stroke="#CA8A04" stroke-width="6" data-attr="opacity: v > 0 ? v / m : 0"/>';
      }
      art = svg(art + svgText(300, 337, '전구 밝기(모형)'), '전구 밝기 모형');
    } else if (kind === '점') {
      var count = Math.max(1, Math.ceil(max));
      var cols = Math.ceil(Math.sqrt(count * 1.6));
      var rows = Math.ceil(count / cols);
      var gap = Math.min(52, 500 / cols, 260 / rows);
      for (var j = 0; j < count; j++) art += '<circle' + attr('cx', 300 + (j % cols - (cols - 1) / 2) * gap) + attr('cy', 150 + (Math.floor(j / cols) - (rows - 1) / 2) * gap) + attr('r', Math.min(18, gap / 3)) + ' fill="#2563EB"' + attr('data-attr', 'opacity: v >= ' + (j + 1) + ' ? 1 : 0.12') + '/>';
      art = svg(art + svgText(300, 330, '입자 수(모형)'), '값에 따른 점 개수 모형');
    } else art = '<div style="padding:120px 24px 0"><div class="bar" data-value="v"' + attr('data-max', max) + '></div><p>' + output('v', value[1]) + ' (모형)</p></div>';
    var right = (block.text ? '<p class="q">' + inline(block.text) + '</p>' : '') + buttons('c', choices.map(function (c) { return c.label; }));
    if (!onOff) right += '<p>' + inline(value[0]) + ' ' + output('v', value[1]) + ' (모형)</p>';
    choices.forEach(function (c, i) { right += '<p' + attr('data-show', 'c == ' + (i + 1)) + '>' + inline(c.text) + '</p>'; });
    return model('choice', lets, art, right);
  }

  function superscript(value) { return String(value).replace(/\d/g, function (n) { return '⁰¹²³⁴⁵⁶⁷⁸⁹'.charAt(Number(n)); }); }
  function shells(z) {
    var result = [];
    [2, 8, 8, 2].forEach(function (cap) { var n = Math.min(cap, z); if (n > 0) result.push(n); z -= n; });
    return result;
  }
  // Above 20 only the outer shell is shown (ground-state neutral main/transition atoms).
  function outerElectrons(z) {
    if (z <= 20) { var s = shells(z); return s[s.length - 1]; }
    var ends = [2, 10, 18, 36, 54, 86, 118];
    var start = 18, end = 36;
    for (var i = 3; i < ends.length; i++) { if (z <= ends[i]) { start = ends[i - 1]; end = ends[i]; break; } }
    var pos = z - start;
    if (pos <= 2) return pos;
    if (z > end - 6) return z - (end - 8);
    return [24, 29, 41, 42, 44, 45, 47, 78, 79].indexOf(z) >= 0 ? 1 : z === 46 ? 0 : 2;
  }
  function renderElectron(block) {
    var atoms = items(block).map(function (line) {
      var m = /^(\S+)\s+(\S+)\s+(\d+)\s+(잃음|얻음)\s+(\d+)$/.exec(unbullet(line.text));
      if (!m || Number(m[3]) < 1 || Number(m[3]) > 118 || Number(m[5]) < 1 || (m[4] === '잃음' && Number(m[5]) > Number(m[3]))) return null;
      var lose = m[4] === '잃음';
      return { symbol: m[1], name: m[2], z: Number(m[3]), k: Number(m[5]), lose: lose,
        formula: m[1] + (Number(m[5]) === 1 ? '' : superscript(m[5])) + (lose ? '⁺' : '⁻'),
        ion: lose ? m[2] + ' 이온' : m[2].replace(/소$/, '') + '화 이온' };
    }).filter(Boolean);
    if (!atoms.length) return fallback(block);
    var lets = 'z = ' + selectExpr('el', atoms.map(function (a) { return String(a.z); })) + '; d = ' + selectExpr('el', atoms.map(function (a) { return String(a.lose ? -a.k : a.k); })) + '; ne = z + (st == 2 ? d : 0); q = z - ne; f = ' + selectExpr('el', atoms.map(function (a) { return quoted(a.formula); })) + '; nm = ' + selectExpr('el', atoms.map(function (a) { return quoted(a.ion); }));
    var art = '';
    atoms.forEach(function (atom, ai) {
      art += '<g' + attr('data-show', 'el == ' + (ai + 1)) + '><circle cx="265" cy="170" r="34" fill="#DC2626"/>' + svgText(265, 178, '+' + atom.z, ' style="fill:white"');
      var neutral = atom.z <= 20 ? shells(atom.z) : [outerElectrons(atom.z)];
      var finalShells = atom.z <= 20 ? shells(atom.z + (atom.lose ? -atom.k : atom.k)) : [Math.max(0, neutral[0] + (atom.lose ? -atom.k : atom.k))];
      var count = Math.max(neutral.length, finalShells.length);
      for (var si = 0; si < (atom.z <= 20 ? Math.max(3, count) : 1); si++) art += '<circle cx="265" cy="170"' + attr('r', atom.z <= 20 ? [70, 110, 150, 160][si] : 150) + ' fill="none" stroke="#94A3B8" stroke-width="2" stroke-dasharray="6 6"/>';
      var lostIndex = 0, gainedIndex = 0;
      for (var shell = 0; shell < count; shell++) {
        var n0 = neutral[shell] || 0;
        var n1 = finalShells[shell] || 0;
        var slots = Math.max(n0, n1);
        for (var ei = 0; ei < slots; ei++) {
          var angle = -Math.PI / 2 + ei * 2 * Math.PI / slots;
          var radius = atom.z <= 20 ? [70, 110, 150, 160][shell] : 150;
          var sx = Math.round(265 + radius * Math.cos(angle));
          var sy = Math.round(170 + radius * Math.sin(angle));
          var fromX = sx, fromY = sy, toX = sx, toY = sy;
          var moving = false;
          if (ei >= n1 && atom.lose) { toX = 560; toY = 95 + 150 * lostIndex++ / Math.max(1, atom.k - 1); moving = true; }
          if (ei >= n0 && !atom.lose) { fromX = 560; fromY = 95 + 150 * gainedIndex++ / Math.max(1, atom.k - 1); moving = true; }
          var expression = 'cx: st == 2 ? ' + toX + ' : ' + fromX + '; cy: st == 2 ? ' + toY + ' : ' + fromY;
          if (moving) expression += '; opacity: st == 2 ? ' + (atom.lose ? '0.35' : '1') + ' : ' + (atom.lose ? '1' : '0.35');
          art += '<circle r="9" fill="#2563EB"' + attr('data-attr', expression) + '/>';
        }
      }
      if (atom.z > 20) art += svgText(300, 335, '안쪽 껍질은 생략(모형)', ' style="font-size:22px"');
      art += '</g>';
    });
    var right = '<div data-at="1">' + buttons('el', atoms.map(function (a) { return a.symbol; }));
    right += '<p>양성자 ' + output('z', '개') + ' · 전자 ' + output('ne', '개') + '</p><p>전하의 합 ' + output("q > 0 ? '+' + q : q == 0 ? '0' : q") + ' (모형)</p>';
    right += '<p data-show="st == 1">양성자 수와 전자 수가 같아 전기적으로 중성이다.</p><p data-show="st == 2 &amp;&amp; q > 0">전자를 잃어 (+)전하가 더 많아졌다. 양이온 <b>' + output('f') + '</b>, ' + output('nm') + '이다.</p><p data-show="st == 2 &amp;&amp; q &lt; 0">전자를 얻어 (−)전하가 더 많아졌다. 음이온 <b>' + output('f') + '</b>, ' + output('nm') + '이다.</p></div>';
    return '<div class="calc lite-model lite-electron" data-ai="모형" data-activity' + attr('data-let', lets) + '><div class="reveal" data-name="st" data-stops="시작|원자|이온"><div' + attr('style', GRID) + '><div class="veil">' + svg(art, '전자를 잃거나 얻어 이온이 되는 모형') + '</div>' + right + '</div></div></div>';
  }

  function safeVariable(name, fallback, taken) { return /^[a-zA-Z]$/.test(name) && RESERVED.indexOf(name) < 0 && taken.indexOf(name) < 0 ? name : fallback; }
  function replaceVariables(expr, map) {
    return expr.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\b[A-Za-z_][A-Za-z_0-9]*\b/g, function (token) { return Object.prototype.hasOwnProperty.call(map, token) ? map[token] : token; });
  }
  function cleanExpr(expr) { return expr.replace(/\bMath\s*\.\s*/g, ''); }
  function renderGraph(block) {
    var f = fields(block);
    var horizontal = pipes(first(f, '가로', 't 0~10 1 | 시간 | 초'));
    var m = /^(\S+)\s+(-?[\d.]+)\s*~\s*(-?[\d.]+)\s+([\d.]+)$/.exec(horizontal[0]);
    var vertical = pipes(first(f, '세로', '0~10 | 값'));
    var vm = /^(-?[\d.]+)\s*~\s*(-?[\d.]+)$/.exec(vertical[0]);
    if (!m || !vm || ![m[2], m[3], m[4], vm[1], vm[2]].every(function (n) { return isFinite(Number(n)); }) || Number(m[3]) <= Number(m[2]) || Number(m[4]) <= 0 || Number(vm[2]) <= Number(vm[1])) return fallback(block);
    var raw = m[1];
    var variable = safeVariable(raw, 'a', ['y']);
    var rename = Object.create(null);
    rename[raw] = variable;
    var choice = first(f, '고르기', '');
    var cm = /^(\S+)\s*=\s*(.*)$/.exec(choice);
    var controls = '';
    if (cm) {
      var chosen = safeVariable(cm[1], variable === 'c' ? 'b' : 'c', ['y', variable]);
      // If the same input name was used twice, the horizontal axis owns it.
      if (cm[1] !== raw) rename[cm[1]] = chosen;
      var values = cm[2].split(',').map(pipes).filter(function (p) { return p[0] !== '' && isFinite(Number(p[0])); });
      controls += '<div class="lite-buttons">' + values.map(function (v, i) { return button(chosen, Number(v[0]), v[1] || v[0], i === 0); }).join('') + '</div>';
    }
    var expr = replaceVariables(cleanExpr(first(f, '식', '0')), rename);
    var curveMap = {}; curveMap[variable] = 'x';
    var line = replaceVariables(expr, curveMap);
    var play = horizontal.indexOf('재생') >= 0;
    var xlabel = (horizontal[1] || variable) + (horizontal[2] ? '(' + horizontal[2] + ')' : '');
    var ylabel = (vertical[1] || '값') + (vertical[2] ? '(' + vertical[2] + ')' : '');
    var art = '<figure class="plot"' + attr('data-x', m[2] + ', ' + m[3]) + attr('data-y', vm[1] + ', ' + vm[2]) + ' data-height="320"' + attr('data-xlabel', xlabel) + attr('data-ylabel', ylabel) + '><i' + attr('data-line', line) + (play ? attr('data-x', m[2] + ', max(' + variable + ', ' + (Number(m[2]) + 0.01) + ')') : '') + '></i><i' + attr('data-point', variable + ', y') + '></i></figure>';
    var right = (block.text ? '<p class="q">' + inline(block.text) + '</p>' : '') + controls;
    right += '<p>' + inline(horizontal[1] || variable) + ' ' + output(variable, horizontal[2]) + '</p><input type="range"' + attr('name', variable) + attr('min', m[2]) + attr('max', m[3]) + attr('step', m[4]) + attr('value', m[2]) + (play ? ' data-play="8"' : '') + attr('aria-label', horizontal[1] || '가로 값') + '>';
    right += '<p>' + inline(vertical[1] || '값') + ' ' + output('y', vertical[2], 1) + ' (모형)</p>';
    (f['문장'] || []).forEach(function (sentence) {
      var s = /^(.*?)\s*(?:→|->)\s*(.*)$/.exec(sentence);
      if (s) right += '<p' + attr('data-show', replaceVariables(cleanExpr(s[1]), rename)) + '>' + inline(s[2]) + '</p>';
      else right += '<p>' + inline(sentence) + '</p>';
    });
    return model('graph', 'y = ' + expr, art, right);
  }

  function renderDiffusion(block) {
    var f = fields(block);
    var membrane = pipes(first(f, '막', '없음 | 왼쪽 | 오른쪽'));
    var species = items(block).map(function (line) {
      var m = /^(\S+)\s+(\d+)\s+(\d+)\s+(통과|막힘)\s+(\S+)$/.exec(unbullet(line.text));
      return m ? { name: m[1], left: Number(m[2]), right: Number(m[3]), pass: m[4] === '통과', color: COLORS[m[5]] || COLORS['회색'] } : null;
    }).filter(Boolean);
    if (!species.length) return fallback(block);
    var labels = (membrane[1] || '왼쪽') + '|' + (membrane[2] || '오른쪽');
    var art = '<figure class="particles"' + (membrane[0] === '있음' ? ' data-membrane="0.5"' : '') + attr('data-labels', labels) + ' data-height="300">';
    var right = '<p>입자의 움직임(모형)</p>';
    species.forEach(function (s, i) {
      var l = 'a' + (i + 1) + 'L', r = 'a' + (i + 1) + 'R';
      art += '<i' + attr('data-kind', s.name) + attr('data-left', s.left) + attr('data-right', s.right) + attr('data-pass', s.pass ? 1 : 0) + attr('data-color', s.color) + attr('data-size', s.pass ? 5 : 8) + attr('data-count', l + ', ' + r) + '></i>';
      right += '<p>' + inline(s.name) + ': ' + inline(membrane[1] || '왼쪽') + ' ' + output(l, '개') + ', ' + inline(membrane[2] || '오른쪽') + ' ' + output(r, '개') + '</p>';
      right += '<div class="bar"' + attr('data-value', r) + attr('data-max', Math.max(1, s.left + s.right)) + attr('style', '--bar-c:' + s.color) + attr('aria-label', s.name + ' 오른쪽 개수') + '></div>';
    });
    return model('diffusion', '', art + '</figure>', right);
  }

  function renderStages(block) {
    var stages = items(block).map(function (l) { return pipes(unbullet(l.text)); });
    if (!stages.length) return fallback(block);
    return '<div class="reveal lite-stages" data-ai="모형"' + attr('data-stops', '시작|' + stages.map(function (s) { return s[0]; }).join('|')) + '>' + (block.text ? '<p class="q">' + inline(block.text) + ' (모형)</p>' : '<p>(모형)</p>') + stages.map(function (s, i) {
      var p = /^그림\s+(.+)$/.exec(s[2] || '');
      return '<div' + attr('data-only', i + 1) + '><p>' + inline(s[1] || s[0]) + '</p>' + (p ? figure(p[1], s[0]) : '') + '</div>';
    }).join('') + '</div>';
  }
  function renderQuiz(block) {
    var choices = items(block).map(function (l) { var p = pipes(unbullet(l.text)); return { text: p[0], why: p.slice(1).join(' | '), ok: l.text.charAt(0) === '*' }; });
    if (!choices.length) return fallback(block);
    return (block.text && !block.asTitle ? '<p class="q" data-n="?">' + inline(block.text) + '</p>' : '') + '<div class="quiz"' + (choices.length > 4 ? ' data-cols="2"' : '') + (choices.filter(function (c) { return c.ok; }).length > 1 ? ' data-multi' : '') + '>' + shuffled(choices, block.text).map(function (c) { return '<button type="button" class="opt"' + (c.ok ? ' data-ok' : '') + attr('data-why', c.why) + '>' + inline(c.text) + '</button>'; }).join('') + '</div>';
  }
  function renderSort(block) {
    var bins = pipes(block.text).filter(Boolean);
    var cards = items(block).map(function (line) {
      var p = pipes(unbullet(line.text));
      var m = /^(.*?)\s*=\s*(.*)$/.exec(p[0]);
      return m ? { name: m[1], bin: m[2].trim(), why: p.slice(1).join(' | ') } : null;
    }).filter(Boolean);
    // 약한 모델은 첫 줄에 '칸1 | 칸2' 대신 물음을 쓴다. 그러면 카드의 '= 칸'에서 칸을 모은다.
    var question = '';
    if (bins.length < 2) {
      question = block.asTitle ? '' : block.text;
      bins = [];
      cards.forEach(function (c) { if (bins.indexOf(c.bin) < 0) bins.push(c.bin); });
    }
    var key = function (s) { return String(s).replace(/[\s'"‘’“”()（）]/g, ''); };
    function findBin(name) {
      var k = key(name);
      for (var i = 0; i < bins.length; i++) if (key(bins[i]) === k) return i;
      for (var j = 0; j < bins.length; j++) if (key(bins[j]).indexOf(k) >= 0 || k.indexOf(key(bins[j])) >= 0) return j;
      // '= 통한다'와 칸 '전기가 통하는 물질'처럼 말이 조금 다를 때: 겹치는 글자가 가장 긴 칸,
      // 같으면 부정어(않·없·못·안) 유무가 같은 칸을 고른다.
      var neg = function (s) { return /않|없|못|안\s|아니/.test(s); };
      // 한글은 활용하면 음절이 바뀐다(통한다/통하는). 자모로 풀어서 겹친 길이를 잰다.
      var jamo = function (s) { return s.normalize ? s.normalize('NFD') : s; };
      var kj = jamo(k);
      var best = -1, bestScore = 3;
      bins.forEach(function (b, bi) {
        var kb = jamo(key(b)), common = 0;
        for (var a = 0; a < kj.length; a++) for (var z = a + common + 1; z <= kj.length; z++) { if (kb.indexOf(kj.slice(a, z)) >= 0) common = z - a; else break; }
        var score = common + (neg(name) === neg(b) ? 1.5 : 0);
        if (common >= 4 && score > bestScore) { best = bi; bestScore = score; }
      });
      return best;
    }
    var html = (question ? '<p class="q" data-n="?">' + inline(question) + '</p>' : '') + '<div class="sort">' + bins.slice(0, 4).map(function (bin, i) { return '<div class="bin"' + attr('data-bin', 'b' + (i + 1)) + '><h3>' + inline(bin) + '</h3></div>'; }).join('');
    cards.forEach(function (c) {
      var at = findBin(c.bin);
      if (at < 0 || at > 3) return;
      var p = [c.name, c.why];
      var m = [null, c.name];
      html += '<span' + attr('data-bin', 'b' + (at + 1)) + attr('data-why', p.slice(1).join(' | ')) + ' data-hint="칸 이름의 특징을 다시 보자.">' + inline(m[1]) + '</span>';
    });
    return html + '</div>';
  }
  function renderOrder(block) {
    // 엔진은 맞은 칸 아래에 이유를 붙여 길어진다. 항목이 5개 이상이면 이유를 빼서 다 푼 뒤 넘치지 않게 한다.
    var list = items(block);
    var keepWhy = list.length < 5;
    return (block.text && !block.asTitle ? '<p class="q" data-n="?">' + inline(block.text) + '</p>' : '') + '<ol class="order">' + list.map(function (l) { var p = pipes(unbullet(l.text)); return '<li' + (keepWhy ? attr('data-why', p.slice(1).join(' | ')) : '') + '>' + inline(p[0]) + '</li>'; }).join('') + '</ol>';
  }
  function renderBlock(b) {
    switch (b.type) {
      case 'paragraph': return '<p>' + inline(b.text) + '</p>';
      case 'step': return '<p class="step">' + inline(b.text) + '</p>';
      case 'question': return '<p class="q" data-n="Q">' + inline(b.text) + '</p>';
      case 'answer': return '<div class="answer"><p>' + inline(b.text) + '</p></div>';
      case 'kicker': return '<p class="kicker">' + inline(b.text) + '</p>';
      case 'ai': return '<p data-ai="AI 작성">' + inline(b.text) + '</p>';
      case 'figure': return figure(b.ppt, b.text);
      case 'video': return '<div class="video"' + attr('data-youtube', b.url) + attr('data-title', b.text) + '></div>';
      case 'link': return '<p><a class="link-card"' + attr('href', b.url) + ' target="_blank" rel="noopener">' + inline(b.text) + '</a></p>';
      case 'table': return '<table class="compare"><thead><tr>' + b.rows[0].map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') + '</tr></thead><tbody>' + b.rows.slice(1).map(function (row) { return '<tr>' + row.map(function (c, i) { var tag = i === 0 ? 'th' : 'td'; return '<' + tag + '>' + inline(c) + '</' + tag + '>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
      case 'quiz': return renderQuiz(b);
      case 'sort': return renderSort(b);
      case 'order': return renderOrder(b);
      case 'drift': return renderDrift(b);
      case 'choice': return renderChoice(b);
      case 'electron': return renderElectron(b);
      case 'graph': return renderGraph(b);
      case 'diffusion': return renderDiffusion(b);
      case 'stages': return renderStages(b);
      default: return fallback(b);
    }
  }
  function renderSlide(slide) {
    var attrs = attr('id', slide.id) + attr('data-title', slide.title) + (slide.section ? attr('data-sec', slide.section) : '');
    if (slide.type === 'cover') return '<section class="slide cover"' + attrs + '><div class="band">' + (slide.blocks.length ? renderBlock(slide.blocks[0]) : '') + '</div><h1>' + inline(slide.title) + '</h1></section>';
    if (slide.type === 'chapter') {
      var m = /^(\d+)\s*[.．)]?\s*(.*)$/.exec(slide.title);
      return '<section class="slide chapter"' + attrs + '><p class="kicker">' + esc(m ? m[1] : '') + '</p><h1>' + inline(m ? m[2] : slide.title) + '</h1></section>';
    }
    var figures = slide.blocks.filter(function (b) { return b.type === 'figure'; });
    var others = slide.blocks.filter(function (b) { return b.type !== 'figure'; });
    var body;
    if (figures.length && others.length) body = '<div class="lite-cols"><div>' + others.map(renderBlock).join('\n') + '</div><div class="lite-pictures' + (figures.length === 2 ? ' lite-two' : figures.length > 2 ? ' lite-many' : '') + '">' + figures.map(renderBlock).join('\n') + '</div></div>';
    else if (figures.length) body = '<div class="lite-figure-only">' + figures.map(renderBlock).join('\n') + '</div>';
    else body = others.map(renderBlock).join('\n');
    return '<section class="slide"' + attrs + '><h2>' + inline(slide.title) + '</h2><div class="lite-body">' + body + '</div></section>';
  }
  function renderLesson(text, opts) {
    var lesson = parseLesson(text);
    var slides = opts && opts.paginate ? paginateLesson(lesson).slides : lesson.slides;
    return slides.map(renderSlide).join('\n');
  }

  // The browser supplies a real CSS measurement; Node can exercise the same split
  // logic with the conservative 34 characters / 48px fallback (opts.paginate).
  function estimateSlide(slide) {
    var pictureBlocks = slide.blocks.filter(function (b) { return b.type === 'figure'; });
    var figures = pictureBlocks.length;
    var chars = figures ? 20 : 34;
    var total = 0;
    slide.blocks.forEach(function (b) {
      if (b.type === 'figure') return;
      if (b.type === 'table') total += b.rows.length * 56;
      else if (b.type === 'answer') total += Math.max(170, Math.ceil(b.text.length / chars) * 48 + 56);
      else if (['drift', 'choice', 'electron', 'graph', 'diffusion', 'stages', 'sort', 'quiz', 'order'].indexOf(b.type) >= 0) total += 460;
      else if (b.type === 'video') total += 430;
      else total += Math.max(1, Math.ceil(b.text.length / chars)) * 48 + 14;
    });
    var pictureHeight = 0;
    if (figures && figures === slide.blocks.length) pictureHeight = 460;
    else if (figures) {
      var width = figures > 2 ? 212 : 440;
      var heights = pictureBlocks.map(function (b) {
        var caption = Math.max(1, Math.ceil((b.text.length * 22 + 32) / width)) * 36 + 12;
        return (figures === 1 ? 300 : figures === 2 ? 180 : 150) + caption;
      });
      for (var i = 0; i < heights.length; i += figures > 2 ? 2 : 1) pictureHeight += Math.max(heights[i], figures > 2 && heights[i + 1] || 0) + (i ? 16 : 0);
    }
    return Math.max(total, pictureHeight);
  }
  function continuationId(id, index) {
    // b … z, aa …; stable IDs even for an exceptionally long lesson.
    var suffix = '', n = index;
    do { suffix = String.fromCharCode(97 + n % 26) + suffix; n = Math.floor(n / 26) - 1; } while (n >= 0);
    return id + suffix;
  }
  function paginateLesson(lesson, measure) {
    var result = { settings: lesson.settings, warnings: lesson.warnings.slice(), slides: [] };
    lesson.slides.forEach(function (source) {
      // 블록이 하나뿐이어도 그것이 표면 행을 나눌 수 있으니 건너뛰지 않는다.
      if (source.type !== 'normal' || !source.blocks.length || (source.blocks.length < 2 && source.blocks[0].type !== 'table')) { result.slides.push(source); return; }
      var part = 0;
      var current = Object.assign({}, source, { blocks: [] });
      // 잴 때와 실제 화면의 글꼴·어절 감싸기 차이로 20px쯤 더 길어질 수 있어 여유를 둔다.
      var budget = (source.section ? 470 : 510) - 20;
      function heightOf(slide) {
        var measured = measure ? measure(slide) : 0;
        return measured > 0 && isFinite(measured) ? measured : estimateSlide(slide);
      }
      // 표 하나가 혼자서도 넘치면 머리줄을 되풀이해 행을 나눈다.
      var blocks = [];
      source.blocks.forEach(function (block) {
        if (block.type !== 'table' || block.rows.length < 3 || heightOf(Object.assign({}, source, { blocks: [block] })) <= budget) { blocks.push(block); return; }
        var head = block.rows[0], chunk = [];
        block.rows.slice(1).forEach(function (row) {
          var trial = chunk.concat([row]);
          if (chunk.length && heightOf(Object.assign({}, source, { blocks: [Object.assign({}, block, { rows: [head].concat(trial) })] })) > budget) {
            blocks.push(Object.assign({}, block, { rows: [head].concat(chunk) }));
            chunk = [row];
          } else chunk = trial;
        });
        if (chunk.length) blocks.push(Object.assign({}, block, { rows: [head].concat(chunk) }));
      });
      blocks.forEach(function (block) {
        var candidate = Object.assign({}, current, { blocks: current.blocks.concat([block]) });
        var height = heightOf(candidate);
        if (height > budget && current.blocks.length) {
          result.slides.push(current);
          part++;
          current = Object.assign({}, source, { id: continuationId(source.id, part), title: source.title + ' (' + (part + 1) + ')', blocks: [block] });
        } else current = candidate;
      });
      result.slides.push(current);
    });
    return result;
  }

  function log(message) { if (root.console && root.console.warn) root.console.warn('[lite] ' + message); }
  function loadEngine(doc, base) {
    if (Array.prototype.some.call(doc.scripts, function (s) { return /(?:^|\/)exploragram\.js(?:[?#]|$)/.test(s.src || ''); })) return;
    var script = doc.createElement('script'); script.src = base + 'exploragram.js';
    script.onerror = function () { log('엔진 JS를 불러오지 못했다: ' + script.src); };
    doc.body.appendChild(script);
  }
  function loadCSS(doc, base) {
    function liteStyle() {
      if (!doc.getElementById('lite-css')) { var style = doc.createElement('style'); style.id = 'lite-css'; style.textContent = LITE_CSS; doc.head.appendChild(style); }
    }
    return new Promise(function (resolve) {
      var link = Array.prototype.filter.call(doc.querySelectorAll('link[rel="stylesheet"]'), function (l) { return /(?:^|\/)exploragram\.css(?:[?#]|$)/.test(l.href || ''); })[0];
      var done = false;
      var timer;
      function finish() { if (!done) { done = true; root.clearTimeout(timer); resolve(); } }
      if (link && link.sheet) { liteStyle(); resolve(); return; }
      timer = root.setTimeout(function () { log('CSS를 5초 안에 불러오지 못해 계속 진행한다.'); finish(); }, 5000);
      if (!link) { link = doc.createElement('link'); link.rel = 'stylesheet'; link.href = base + 'exploragram.css'; }
      link.addEventListener('load', finish);
      link.addEventListener('error', function () { log('엔진 CSS를 불러오지 못했다.'); finish(); });
      if (!link.parentNode) doc.head.appendChild(link);
      liteStyle();
    });
  }
  // 엔진 글꼴(Pretendard, 글자별 나눠 받기)이 오기 전에 재면 줄바꿈이 달라 실제 화면에서 넘친다.
  // 수업 글의 글자로 글꼴을 미리 불러 두고, 3초 넘으면 그냥 잰다.
  function waitFonts(doc, text) {
    if (!doc.fonts || !doc.fonts.load) return Promise.resolve();
    var sample = String(text || '').replace(/\s+/g, '').slice(0, 3000) || '가';
    var load = Promise.all(['400', '700'].map(function (w) { return doc.fonts.load(w + ' 30px "Pretendard Variable"', sample); })).then(function () { return doc.fonts.ready; });
    return Promise.race([load, new Promise(function (r) { root.setTimeout(r, 3000); })]).catch(function () {});
  }
  function measureSlides(doc, lesson) {
    var host = doc.createElement('div'); host.className = 'lite-measure'; host.setAttribute('aria-hidden', 'true'); doc.body.appendChild(host);
    try {
      return paginateLesson(lesson, function (candidate) {
        host.innerHTML = renderSlide(candidate);
        // The engine will replace empty images with these placeholders later.
        // Include their real CSS and caption height while measuring, rather
        // than measuring a broken img with zero intrinsic height.
        Array.prototype.forEach.call(host.querySelectorAll('img[data-ppt]'), function (img) {
          if (img.getAttribute('src')) return;
          img.hidden = true;
          var ph = doc.createElement('span'); ph.className = 'ch-ppt-ph';
          var label = doc.createElement('b'); label.textContent = '원본 PPT를 이 화면에 끌어다 놓으세요';
          var detail = doc.createElement('small'); detail.textContent = 'PPT ' + img.getAttribute('data-ppt') + ' · ' + (img.getAttribute('alt') || '');
          ph.appendChild(label); ph.appendChild(detail);
          img.parentNode.insertBefore(ph, img.nextSibling);
        });
        var body = host.querySelector('.lite-body');
        if (!body) return 0;
        var rect = body.getBoundingClientRect();
        var height = rect.height;
        // Engine-created controls are not in the DOM yet. Reserve their full
        // published height so pagination does not depend on the closed state.
        candidate.blocks.forEach(function (b) {
          if (['drift', 'choice', 'electron', 'graph', 'diffusion', 'stages', 'quiz', 'sort', 'order', 'figure', 'video'].indexOf(b.type) >= 0) height = Math.max(height, estimateSlide(candidate));
        });
        var heading = host.querySelector('h2');
        if (heading) height += Math.max(0, heading.getBoundingClientRect().height - 51);
        return height;
      });
    } finally { doc.body.removeChild(host); }
  }
  function start(doc, script) {
    if (doc.__resonanceLiteStarted) return;
    doc.__resonanceLiteStarted = true;
    var base = script && script.getAttribute('data-engine') || DEFAULT_ENGINE;
    if (base.charAt(base.length - 1) !== '/') base += '/';
    if (doc.body.querySelector('section.slide')) { loadEngine(doc, base); return; }
    var source = doc.querySelector('script[type="text/x-lesson"], script[type="text/plain"]#lesson');
    if (!source) { log('수업 글 script를 찾지 못했다.'); return; }
    var lesson = parseLesson(source.textContent);
    doc.documentElement.lang = 'ko';
    doc.documentElement.setAttribute('data-deck', lesson.settings.deck || deckKey(doc.title || '수업'));
    doc.body.setAttribute('data-theme', 'ppt');
    if (lesson.settings.accent) { doc.body.style.setProperty('--accent', lesson.settings.accent); doc.body.style.setProperty('--tab', lesson.settings.accent); doc.body.style.setProperty('--tab-ink', '#fff'); }
    if (!doc.querySelector('meta[name="viewport"]')) { var meta = doc.createElement('meta'); meta.name = 'viewport'; meta.content = 'width=device-width, initial-scale=1'; doc.head.appendChild(meta); }
    lesson.warnings.forEach(function (w) { log(w.line + '행: ' + w.message); });
    loadCSS(doc, base).then(function () { return waitFonts(doc, source.textContent); }).then(function () {
      var marker = doc.createElement('div');
      doc.body.appendChild(marker);
      // Expand first, measure offscreen, then replace only these new slides.
      var slides = [];
      function insert(list) {
        list.forEach(function (slide) { var wrap = doc.createElement('div'); wrap.innerHTML = renderSlide(slide); var node = wrap.firstElementChild; doc.body.insertBefore(node, marker); slides.push(node); });
      }
      try {
        insert(lesson.slides);
        var divided = measureSlides(doc, lesson);
        slides.forEach(function (s) { s.parentNode.removeChild(s); }); slides = [];
        insert(divided.slides);
      } catch (err) { log('장을 나누는 중: ' + err.message); }
      marker.parentNode.removeChild(marker);
      loadEngine(doc, base);
    }).catch(function (err) { log(err.message); loadEngine(doc, base); });
  }

  var api = { parseLesson: parseLesson, renderLesson: renderLesson, paginateLesson: paginateLesson, css: LITE_CSS };
  if (typeof module !== 'undefined' && module.exports) module.exports = { parseLesson: parseLesson, renderLesson: renderLesson, paginateLesson: paginateLesson, css: LITE_CSS };
  if (typeof document !== 'undefined') {
    root.ResonanceLite = api;
    var ownScript = document.currentScript;
    var boot = function () { try { start(document, ownScript); } catch (err) { log(err.message); } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
  }
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
