/* Shabda Sathi – daily vocabulary app
 * Hierarchy: Month -> Week -> Day (6 words per day)
 * Rules: future days are locked until their calendar date; today & past days are open.
 * Progress is stored in localStorage on this device.
 * Testing tip: add ?date=2026-10-10 to the URL to simulate a different "today".
 */
(function () {
  'use strict';

  // ---------- Config ----------
  const WORDS_PER_DAY = 6;
  const START = new Date(2026, 9, 4);  // 4 Oct 2026 (yesterday at launch)
  const END = new Date(2027, 3, 5);    // 5 Apr 2027 (six months ahead)
  const STORAGE_KEY = 'shabdaSathi.progress.v1';
  const PREF_KEY = 'shabdaSathi.prefs.v1';
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // ---------- Date helpers (local time, never UTC) ----------
  const pad = (n) => String(n).padStart(2, '0');
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const monthKeyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const longDate = (d) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const shortDate = (d) => `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;

  function getToday() {
    const p = new URLSearchParams(location.search).get('date');
    if (p && /^\d{4}-\d{2}-\d{2}$/.test(p)) return parseKey(p);
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }
  let today = getToday();
  let todayKey = keyOf(today);

  // ---------- Words ----------
  const WORDS = (window.WORD_TEXT || []).join('\n').split('\n')
    .map((l) => l.trim()).filter(Boolean)
    .map((l) => { const [word, nepali, synonym, antonym] = l.split('|').map((s) => s.trim()); return { word, nepali, synonym, antonym }; });

  // ---------- Build calendar structure ----------
  const days = [];
  const dayByKey = {};
  for (let d = new Date(START), i = 0; d <= END; d.setDate(d.getDate() + 1), i++) {
    const date = new Date(d);
    const day = {
      index: i, key: keyOf(date), date,
      monthKey: monthKeyOf(date), week: Math.ceil(date.getDate() / 7),
      words: WORDS.slice(i * WORDS_PER_DAY, i * WORDS_PER_DAY + WORDS_PER_DAY),
    };
    days.push(day);
    dayByKey[day.key] = day;
  }

  const months = [];
  days.forEach((day) => {
    let m = months[months.length - 1];
    if (!m || m.key !== day.monthKey) {
      m = { key: day.monthKey, year: day.date.getFullYear(), month: day.date.getMonth(), weeks: [] };
      months.push(m);
    }
    let w = m.weeks.find((x) => x.n === day.week);
    if (!w) { w = { n: day.week, days: [] }; m.weeks.push(w); }
    w.days.push(day);
  });
  const monthByKey = Object.fromEntries(months.map((m) => [m.key, m]));

  // ---------- Persistence ----------
  const load = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) || fallback; } catch { return fallback; } };
  const progress = load(STORAGE_KEY, { days: {} });
  if (!progress.days || typeof progress.days !== 'object') progress.days = {};
  const prefs = load(PREF_KEY, { hideNepali: false, theme: 'light' });
  const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  const savePrefs = () => localStorage.setItem(PREF_KEY, JSON.stringify(prefs));

  function getDayRecord(key) {
    if (!progress.days || typeof progress.days !== 'object') progress.days = {};
    if (!progress.days[key] || typeof progress.days[key] !== 'object') {
      progress.days[key] = { learned: Array(WORDS_PER_DAY).fill(false), completedAt: null };
    }
    const r = progress.days[key];
    if (!Array.isArray(r.learned)) {
      r.learned = Array(WORDS_PER_DAY).fill(Boolean(r.completedAt));
    }
    while (r.learned.length < WORDS_PER_DAY) {
      r.learned.push(false);
    }
    return r;
  }

  // ---------- Status ----------
  function status(day) {
    if (!day) return 'locked';
    const r = getDayRecord(day.key);
    if (r.completedAt) return 'completed';
    if (day.key > todayKey) return 'locked';
    if (day.key === todayKey) return 'today';
    return 'missed';
  }
  const STATUS_LABEL = { completed: '✓ Completed', today: '★ Today', missed: '! Missed – catch up', locked: '🔒 Locked' };
  const isOpen = (day) => day && day.key <= todayKey;

  function stats() {
    const completed = days.filter((d) => Boolean(getDayRecord(d.key).completedAt)).length;
    let streak = 0;
    const cursor = new Date(today);
    if (!getDayRecord(keyOf(cursor)).completedAt) cursor.setDate(cursor.getDate() - 1);
    while (dayByKey[keyOf(cursor)] && getDayRecord(keyOf(cursor)).completedAt) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return { completed, words: completed * WORDS_PER_DAY, streak, total: days.length };
  }

  // ---------- View state ----------
  const todayDay = dayByKey[todayKey];
  let view = todayDay ? { type: 'day', key: todayKey } : { type: 'month', key: months[0].key };
  const openNodes = new Set();
  function openFor(v) {
    if (v.type === 'day') { const d = dayByKey[v.key]; openNodes.add(d.monthKey); openNodes.add(`${d.monthKey}-w${d.week}`); }
    if (v.type === 'week') { openNodes.add(v.month); openNodes.add(`${v.month}-w${v.n}`); }
    if (v.type === 'month') openNodes.add(v.key);
  }
  openFor(view);

  // ---------- DOM ----------
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function navigate(v) {
    view = v; openFor(v); render();
    closeSidebar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- Header stats ----------
  function renderStats() {
    const s = stats();
    const pct = Math.round((s.completed / s.total) * 100);
    $('#stats').innerHTML = `
      <div class="stat"><span class="stat-icon">📅</span><div><b>${shortDate(today)} ${today.getFullYear()}</b><small>${WEEKDAYS[today.getDay()]} · Today</small></div></div>
      <div class="stat"><span class="stat-icon">🔥</span><div><b>${s.streak} day${s.streak === 1 ? '' : 's'}</b><small>Streak</small></div></div>
      <div class="stat"><span class="stat-icon">📚</span><div><b>${s.words}</b><small>Words learned</small></div></div>
      <div class="stat"><span class="stat-icon">🏆</span><div><b>${pct}%</b><small>${s.completed}/${s.total} days</small></div></div>`;
  }

  // ---------- Sidebar tree ----------
  function renderTree() {
    const tree = $('#tree');
    tree.innerHTML = '';
    months.forEach((m) => {
      const mDays = m.weeks.flatMap((w) => w.days);
      const mDone = mDays.filter((d) => status(d) === 'completed').length;
      const mNode = el('div', 'node month' + (openNodes.has(m.key) ? ' open' : ''));
      const mBtn = el('button', 'node-btn' + (view.type === 'month' && view.key === m.key ? ' active' : ''),
        `<span class="caret">▶</span><span class="node-label">${MONTHS[m.month]} ${m.year}</span><span class="node-meta">${mDone}/${mDays.length}</span>`);
      mBtn.id = `nav-month-${m.key}`;
      mBtn.onclick = () => {
        const isActive = view.type === 'month' && view.key === m.key;
        if (isActive && openNodes.has(m.key)) { openNodes.delete(m.key); render(); } else navigate({ type: 'month', key: m.key });
      };
      mNode.appendChild(mBtn);

      const mKids = el('div', 'children');
      m.weeks.forEach((w) => {
        const wId = `${m.key}-w${w.n}`;
        const wDone = w.days.filter((d) => status(d) === 'completed').length;
        const wNode = el('div', 'node week' + (openNodes.has(wId) ? ' open' : ''));
        const first = w.days[0].date, last = w.days[w.days.length - 1].date;
        const wBtn = el('button', 'node-btn' + (view.type === 'week' && view.month === m.key && view.n === w.n ? ' active' : ''),
          `<span class="caret">▶</span><span class="node-label">Week ${w.n} <small class="node-meta">${first.getDate()}–${last.getDate()}</small></span><span class="node-meta">${wDone}/${w.days.length}</span>`);
        wBtn.id = `nav-week-${wId}`;
        wBtn.onclick = () => {
          const isActive = view.type === 'week' && view.month === m.key && view.n === w.n;
          if (isActive && openNodes.has(wId)) { openNodes.delete(wId); render(); } else navigate({ type: 'week', month: m.key, n: w.n });
        };
        wNode.appendChild(wBtn);

        const wKids = el('div', 'children');
        w.days.forEach((d) => {
          const st = status(d);
          const b = el('button', 'node-btn day-btn' + (view.type === 'day' && view.key === d.key ? ' active' : ''),
            `<i class="dot ${st}"></i><span class="node-label">${shortDate(d.date)}<small>${WEEKDAYS[d.date.getDay()]}</small></span>${st === 'locked' ? '<span class="node-meta">🔒</span>' : ''}`);
          b.id = `nav-day-${d.key}`;
          b.onclick = () => navigate({ type: 'day', key: d.key });
          wKids.appendChild(b);
        });
        wNode.appendChild(wKids);
        mKids.appendChild(wNode);
      });
      mNode.appendChild(mKids);
      tree.appendChild(mNode);
    });
    const active = tree.querySelector('.day-btn.active') || tree.querySelector('.node-btn.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  // ---------- Breadcrumbs ----------
  function crumbs(parts) {
    const c = el('div', 'crumbs');
    parts.forEach((p, i) => {
      if (i) c.appendChild(el('span', '', '›'));
      if (p.go) { const b = el('button', '', p.label); b.onclick = () => navigate(p.go); c.appendChild(b); }
      else c.appendChild(el('span', 'current', p.label));
    });
    return c;
  }

  // ---------- Month view ----------
  function renderMonth(m) {
    const mDays = m.weeks.flatMap((w) => w.days);
    const done = mDays.filter((d) => status(d) === 'completed').length;
    const p = el('section', 'panel');
    p.appendChild(crumbs([{ label: `${MONTHS[m.month]} ${m.year}` }]));
    p.insertAdjacentHTML('beforeend', `
      <div class="panel-head">
        <div><h2 class="panel-title"><span class="grad">${MONTHS[m.month]}</span> ${m.year}</h2>
        <p class="panel-sub">${mDays.length} days · ${mDays.length * WORDS_PER_DAY} words · ${done} days completed</p></div>
        <div style="min-width:220px"><div class="progress"><i style="width:${(done / mDays.length) * 100}%"></i></div></div>
      </div>`);

    const chips = el('div', 'week-chips');
    m.weeks.forEach((w) => {
      const wd = w.days.filter((d) => status(d) === 'completed').length;
      const b = el('button', 'week-chip', `Week ${w.n}<small>${shortDate(w.days[0].date)} – ${shortDate(w.days[w.days.length - 1].date)} · ${wd}/${w.days.length} done</small>`);
      b.id = `chip-week-${m.key}-${w.n}`;
      b.onclick = () => navigate({ type: 'week', month: m.key, n: w.n });
      chips.appendChild(b);
    });
    p.appendChild(chips);

    const cal = el('div', 'cal');
    WEEKDAYS.forEach((w) => cal.appendChild(el('div', 'cal-head', w)));
    const first = new Date(m.year, m.month, 1);
    const daysInMonth = new Date(m.year, m.month + 1, 0).getDate();
    for (let i = 0; i < first.getDay(); i++) cal.appendChild(el('div'));
    for (let dnum = 1; dnum <= daysInMonth; dnum++) {
      const d = dayByKey[keyOf(new Date(m.year, m.month, dnum))];
      if (!d) { cal.appendChild(el('div', 'cal-cell out', `<span class="num">${dnum}</span>`)); continue; }
      const st = status(d);
      const icon = { completed: '✓', today: '★', missed: '!', locked: '🔒' }[st];
      const c = el('button', `cal-cell ${st}`, `<span class="num">${dnum}</span><span class="st">${icon} ${st === 'completed' ? 'Done' : st === 'today' ? 'Today' : st === 'missed' ? 'Missed' : 'Locked'}</span>`);
      c.onclick = () => navigate({ type: 'day', key: d.key });
      cal.appendChild(c);
    }
    p.appendChild(cal);
    return p;
  }

  // ---------- Week view ----------
  function renderWeek(m, w) {
    const p = el('section', 'panel');
    p.appendChild(crumbs([{ label: `${MONTHS[m.month]} ${m.year}`, go: { type: 'month', key: m.key } }, { label: `Week ${w.n}` }]));
    const done = w.days.filter((d) => status(d) === 'completed').length;
    p.insertAdjacentHTML('beforeend', `
      <div class="panel-head">
        <div><h2 class="panel-title">Week ${w.n} <span class="grad">· ${MONTHS[m.month]}</span></h2>
        <p class="panel-sub">${shortDate(w.days[0].date)} – ${shortDate(w.days[w.days.length - 1].date)} · ${done}/${w.days.length} days completed</p></div>
        <div style="min-width:220px"><div class="progress"><i style="width:${(done / w.days.length) * 100}%"></i></div></div>
      </div>`);
    const grid = el('div', 'day-cards');
    w.days.forEach((d) => {
      const st = status(d);
      const preview = isOpen(d) ? d.words.map((x) => esc(x.word)).join(' · ') : 'word · word · word · word · word · word';
      const c = el('button', `day-card ${st}`, `
        <div class="dc-day">${longDate(d.date).split(',')[0]}</div>
        <div class="dc-date">${shortDate(d.date)}</div>
        <div class="dc-words">${preview}</div>
        <span class="badge ${st}">${STATUS_LABEL[st]}</span>`);
      c.id = `card-day-${d.key}`;
      c.onclick = () => navigate({ type: 'day', key: d.key });
      grid.appendChild(c);
    });
    p.appendChild(grid);
    return p;
  }

  // ---------- Day view ----------
  let countdownTimer = null;
  function renderDay(d) {
    if (!d) d = dayByKey[todayKey] || days[0];
    const m = monthByKey[d.monthKey] || months[0];
    const st = status(d);
    const p = el('section', 'panel');
    p.appendChild(crumbs([
      { label: `${MONTHS[m.month]} ${m.year}`, go: { type: 'month', key: m.key } },
      { label: `Week ${d.week}`, go: { type: 'week', month: m.key, n: d.week } },
      { label: shortDate(d.date) },
    ]));
    p.insertAdjacentHTML('beforeend', `
      <div class="panel-head">
        <div><h2 class="panel-title">${longDate(d.date).split(',')[0]}, <span class="grad">${d.date.getDate()} ${MONTHS[d.date.getMonth()]}</span></h2>
        <p class="panel-sub">Day ${d.index + 1} of ${days.length} · ${WORDS_PER_DAY} new words</p></div>
        <span class="badge ${st}">${STATUS_LABEL[st]}</span>
      </div>`);

    // Toolbar (prev / next / hide nepali)
    const bar = el('div', 'toolbar');
    const prev = days[d.index - 1], next = days[d.index + 1];
    const prevBtn = el('button', 'nav-btn', '← Previous day'); prevBtn.id = 'btn-prev-day';
    prevBtn.disabled = !prev; prevBtn.onclick = () => prev && navigate({ type: 'day', key: prev.key });
    const nextBtn = el('button', 'nav-btn', 'Next day →'); nextBtn.id = 'btn-next-day';
    nextBtn.disabled = !next; nextBtn.onclick = () => next && navigate({ type: 'day', key: next.key });
    bar.append(prevBtn, nextBtn, el('span', 'spacer'));

    if (st === 'locked') {
      p.appendChild(bar);
      p.appendChild(renderLocked(d));
      return p;
    }

    const hideBtn = el('button', 'toggle' + (prefs.hideNepali ? ' on' : ''), '<span class="switch"></span> Practice mode: hide Nepali');
    hideBtn.id = 'toggle-hide-nepali';
    hideBtn.onclick = () => { prefs.hideNepali = !prefs.hideNepali; savePrefs(); render(); };
    bar.appendChild(hideBtn);
    p.appendChild(bar);

    const r = getDayRecord(d.key);
    const completed = Boolean(r.completedAt);

    const wrap = el('div', 'table-wrap');
    const table = el('table', 'vocab');
    table.innerHTML = `<thead><tr><th>#</th><th>Word</th><th>Nepali Meaning (नेपाली अर्थ)</th><th>Synonym</th><th>Antonym</th><th>Learned</th></tr></thead>`;
    const tbody = el('tbody');
    const dayWords = Array.isArray(d.words) && d.words.length ? d.words : [];
    dayWords.forEach((w, i) => {
      const learned = completed || Boolean(r.learned[i]);
      const tr = el('tr', learned ? 'learned' : '');
      tr.style.animationDelay = `${i * 60}ms`;
      tr.innerHTML = `
        <td><div class="idx">${i + 1}</div></td>
        <td><div class="word-cell"><span class="word">${esc(w.word)}</span><button class="speak" title="Listen" aria-label="Pronounce ${esc(w.word)}">🔊</button></div></td>
        <td><span class="nepali${prefs.hideNepali ? ' hidden' : ''}" title="${prefs.hideNepali ? 'Click to reveal' : ''}">${esc(w.nepali)}</span></td>
        <td><span class="pill syn">${esc(w.synonym)}</span></td>
        <td><span class="pill ant">${esc(w.antonym)}</span></td>
        <td><button class="check${learned ? ' on' : ''}" id="check-${d.key}-${i}" aria-label="Mark ${esc(w.word)} as learned" ${completed ? 'disabled' : ''}>✓</button></td>`;
      tr.querySelector('.speak').onclick = () => speak(w.word);
      tr.querySelector('.nepali').onclick = (e) => e.currentTarget.classList.remove('hidden');
      tr.querySelector('.check').onclick = () => {
        const rr = getDayRecord(d.key);
        rr.learned[i] = !rr.learned[i];
        save();
        render();
      };
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    p.appendChild(wrap);

    // Footer: progress + complete button
    const count = completed ? WORDS_PER_DAY : (r.learned || []).filter(Boolean).length;
    const foot = el('div', 'day-footer');
    foot.innerHTML = `<span class="count">${count}/${WORDS_PER_DAY} learned</span><div class="progress"><i style="width:${(count / WORDS_PER_DAY) * 100}%"></i></div>`;
    const cta = el('button', 'cta' + (completed ? ' done' : ''));
    cta.id = 'btn-mark-complete';
    if (completed) {
      cta.textContent = '✓ Day Completed';
      cta.disabled = true;
    } else {
      cta.textContent = st === 'missed' ? 'Mark as Completed (catch-up)' : 'Mark Day as Completed';
      cta.disabled = count < WORDS_PER_DAY;
      cta.onclick = () => {
        const rr = getDayRecord(d.key);
        rr.completedAt = new Date().toISOString();
        rr.learned = Array(WORDS_PER_DAY).fill(true);
        save();
        confetti();
        toast(`🎉 Great job! ${WORDS_PER_DAY} new words learned.`);
        render();
      };
    }
    foot.appendChild(cta);
    p.appendChild(foot);

    if (completed) {
      const undo = el('button', 'link-btn', 'Undo completion'); undo.id = 'btn-undo-complete';
      undo.onclick = () => {
        if (confirm('Mark this day as not completed?')) {
          const rr = getDayRecord(d.key);
          rr.completedAt = null;
          save();
          render();
        }
      };
      const note = el('p', 'note', `Completed on ${new Date(r.completedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} · `);
      note.appendChild(undo);
      p.appendChild(note);
    } else {
      p.appendChild(el('p', 'note', 'Tick ✓ each word after you can say its meaning, synonym and antonym without looking. Then mark the day as completed.'));
    }
    return p;
  }

  function renderLocked(d) {
    const box = el('div', 'locked-view');
    const daysAway = Math.round((d.date - today) / 86400000);
    box.innerHTML = `
      <div class="lock-icon">🔒</div>
      <h3>These words are locked</h3>
      <p>They unlock on <b>${longDate(d.date)}</b> — ${daysAway === 1 ? 'tomorrow' : `in ${daysAway} days`}.</p>
      <p>Finish today's words first! 📖</p>
      <div class="countdown" id="countdown"></div>
      <div class="ghost-rows">${'<div></div>'.repeat(WORDS_PER_DAY)}</div>`;
    const tick = () => {
      const cd = box.querySelector('#countdown');
      if (!cd) return;
      let ms = d.date - new Date();
      if (new URLSearchParams(location.search).get('date')) ms = d.date - today; // simulated date
      if (ms <= 0) { refreshDate(); return; }
      const s = Math.floor(ms / 1000);
      const parts = [[Math.floor(s / 86400), 'Days'], [Math.floor((s % 86400) / 3600), 'Hours'], [Math.floor((s % 3600) / 60), 'Minutes'], [s % 60, 'Seconds']];
      cd.innerHTML = parts.map(([v, l]) => `<div><b>${pad(v)}</b><small>${l}</small></div>`).join('');
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
    return box;
  }

  // ---------- Extras ----------
  function speak(text) {
    if (!('speechSynthesis' in window)) return toast('Speech is not supported in this browser.');
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; u.rate = 0.85;
    speechSynthesis.speak(u);
  }

  function confetti() {
    const box = $('#confetti');
    const colors = ['#a78bfa', '#22d3ee', '#fbbf24', '#34d399', '#f472b6', '#ffffff'];
    for (let i = 0; i < 120; i++) {
      const c = el('i');
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = 2 + Math.random() * 2 + 's';
      c.style.animationDelay = Math.random() * 0.5 + 's';
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      box.appendChild(c);
    }
    setTimeout(() => (box.innerHTML = ''), 4500);
  }

  function toast(msg) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const t = el('div', 'toast', msg);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  // ---------- Sidebar (mobile) ----------
  const sidebar = $('#sidebar'), scrim = $('#scrim');
  function closeSidebar() { sidebar.classList.remove('open'); scrim.classList.remove('show'); }
  $('#menu-toggle').onclick = () => { sidebar.classList.add('open'); scrim.classList.add('show'); };
  const sidebarClose = $('#sidebar-close');
  if (sidebarClose) sidebarClose.onclick = closeSidebar;
  scrim.onclick = closeSidebar;
  $('#go-today').onclick = () => {
    if (dayByKey[todayKey]) navigate({ type: 'day', key: todayKey });
    else toast(todayKey < days[0].key ? 'The course has not started yet.' : 'The 6-month course is finished! 🎓');
  };

  // ---------- Midnight rollover: unlock the new day automatically ----------
  function refreshDate() {
    const t = getToday();
    if (keyOf(t) !== todayKey) {
      today = t; todayKey = keyOf(t);
      if (dayByKey[todayKey]) toast('🌅 A new day! Today\'s words are now unlocked.');
      render();
    }
  }
  setInterval(refreshDate, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDate(); });

  // ---------- Render ----------
  function render() {
    try {
      if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
      renderStats();
      renderTree();
      const content = $('#content');
      if (!content) return;
      content.innerHTML = '';
      if (view.type === 'month') {
        const m = monthByKey[view.key];
        content.appendChild(m ? renderMonth(m) : renderDay(dayByKey[todayKey] || days[0]));
      } else if (view.type === 'week') {
        const m = monthByKey[view.month];
        const w = m?.weeks?.find((x) => x.n === view.n);
        content.appendChild(m && w ? renderWeek(m, w) : renderDay(dayByKey[todayKey] || days[0]));
      } else {
        const d = dayByKey[view.key] || dayByKey[todayKey] || days[0];
        content.appendChild(renderDay(d));
      }
    } catch (err) {
      console.error('Render error:', err);
      const content = $('#content');
      if (content) {
        content.innerHTML = `
          <div class="panel" style="text-align: center; padding: 40px 20px;">
            <div style="font-size: 3rem; margin-bottom: 12px;">⚠️</div>
            <h3 style="font-size: 1.4rem; font-weight: 800; color: #0f172a; margin-bottom: 8px;">Learning Session Recovery</h3>
            <p style="color: #64748b; margin-bottom: 20px;">An error occurred rendering your vocabulary words. Click below to load fresh words:</p>
            <button class="cta" onclick="localStorage.clear(); location.reload();">Reset & Load Fresh Words</button>
          </div>`;
      }
    }
  }

  // ---------- Theme Switcher ----------
  function applyTheme(theme) {
    prefs.theme = theme || 'light';
    if (prefs.theme === 'light') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', prefs.theme);
    }
    document.querySelectorAll('.theme-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.theme === prefs.theme);
    });
    savePrefs();
  }

  document.querySelectorAll('.theme-btn').forEach((btn) => {
    btn.onclick = () => applyTheme(btn.dataset.theme);
  });
  applyTheme(prefs.theme || 'light');

  render();
})();
