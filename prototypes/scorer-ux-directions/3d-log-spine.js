// PROTOTYPE: Round 3 prototype 3D, "Log spine". The analysis log of the scored file is the backbone of the result
// review page. Overrides, start choices and penalty suggestions sit inline on the log rows they relate to, the check
// reasons are pinned above, and the map and output summary stay in a sticky aside.
(function () {
  const KH = window.KH;
  const Q = KH.q;
  const W = KH.w;
  const R = KH.r3;
  const e = KH.esc;

  const box = (title, body, cls) => (body ? '<section class="wf-box' + (cls ? ' ' + cls : '') + '">' + (title ? '<h3>' + title + '</h3>' : '') + body + '</section>' : '');
  const btn = (label, attrs) => '<button class="wf-btn small" ' + attrs + '>' + label + '</button>';
  const timeForm = (submit, f, label, value, extra) =>
    '<form data-submit="' + submit + '" data-file="' + f.id + '">' + (extra || '') + W.input('time', value || '', 'placeholder="hh:mm:ss"') + '<button class="wf-btn small">' + label + '</button></form>';
  const overrideTag = (f, kind) => '<span class="d3-ovtag"><i class="mdi mdi-pencil-outline"></i>override</span>' + btn('Remove', 'data-act="clearOverride" data-file="' + f.id + '" data-kind="' + kind + '"');

  // The same reminders W.analysisLog derives from the current links. They depend on the scored file, not on the run.
  function contextEntries(f, res) {
    const out = [];
    if (!res.ok) return out;
    const cls = Q.class(res.classDay.classId);
    if (res.role === 'secondary' && res.result.scoredFileId === f.id) {
      out.push({ level: 'warning', time: '', text: 'The scored file is from a secondary logger. Consider a public remark that indicates its use.', rule: KH.ruleRef('secondary', cls.edition), remark: true });
      if (KH.effective(res.classDay, cls).pevStart === 'yes') out.push({ level: 'warning', time: '', text: 'PEVs of this secondary logger are used for the start. The rule set accepts PEVs only from the primary logger. Use a start override if the primary has a valid PEV.', rule: KH.ruleRef('secondary-pev', cls.edition) });
    }
    if (f.suggestedCid && (f.suggestedCid !== res.competitor.cid || f.suggestedClass !== cls.name)) {
      out.push({ level: 'warning', time: '', text: 'The pilot chose ' + f.suggestedClass + ' ' + f.suggestedCid + ' on upload, but the logger link resolves to ' + cls.name + ' ' + res.competitor.cid + '.', adjust: true });
    }
    return out;
  }

  // Actions and override marks for one log entry. Returns { act, override }.
  function rowActions(x, f, r, task) {
    const o = f.overrides;
    const pen = (text) => btn('Add penalty…', 'data-act="d3Penalty" data-result="' + r.id + '" data-text="' + e(text) + '"');
    if (x.adjust) return { act: '<a class="wf-btn small" href="#' + R.links.logger(Q.logger(f.loggerId)) + '">Adjust links</a>' };
    if (x.remark) return { act: btn('Add public remark…', 'data-act="d3Remark"') };
    if (x.kind === 'start' && x.candidate) {
      const c = (f.analysis.candidates || []).find((k) => k.time === x.candidate);
      if (!c) return {};
      const byOverride = o.start && o.start.kind === 'candidate' && o.start.time === c.time;
      return {
        override: byOverride,
        act: (c.auto ? '<span class="wf-badge">automatic</span> ' : '') + (c.inUse ? '<span class="wf-badge solid">in use</span> ' + (byOverride ? overrideTag(f, 'start') : '') : btn('Use this start', 'data-act="useCandidate" data-file="' + f.id + '" data-time="' + c.time + '"')) +
          (c.breaches.length ? ' ' + pen('Start: ' + c.breaches.join(', ')) : ''),
      };
    }
    if (x.text === 'Start time set by override') return { override: true, act: overrideTag(f, 'start') };
    if (x.kind === 'near-miss') return { act: btn('Credit turnpoint', 'data-act="creditTp" data-file="' + f.id + '" data-idx="' + x.tpIndex + '"') };
    if (x.kind === 'finish-miss') return { act: btn('Credit finish', 'data-act="creditFinish" data-file="' + f.id + '"') };
    if (x.text.includes('(credited by override)')) return { override: true, act: overrideTag(f, 'tpCredits') };
    if (x.text === 'Finish credited by override') return { override: true, act: overrideTag(f, 'finishCredit') };
    if (x.text.startsWith('Flight end set by override')) return { override: true, act: overrideTag(f, 'flightEnd') };
    if (x.suggestion) {
      const set = o.flightEnd === x.suggestion.time;
      return { act: (set ? '<span class="wf-badge solid">flight end set</span>' : btn('Set flight end ' + x.suggestion.time, 'data-act="acceptFlightEnd" data-file="' + f.id + '" data-time="' + x.suggestion.time + '"')) + ' ' + pen(x.text) };
    }
    if (x.kind === 'finish-height') return { act: pen(x.text) };
    if (x.text.startsWith('Finish at')) {
      if (o.finishTime) return { override: true, act: overrideTag(f, 'finishTime') };
      return { act: timeForm('setFinishTime', f, 'Set finish time', '') };
    }
    if (x.text.startsWith('Landing')) return { act: o.flightEnd ? '' : timeForm('setFlightEnd', f, 'Set flight end', '') };
    const pinned = x.text.match(/^Assigned area (\d+) .*: pinned fix /);
    if (pinned) return { override: true, act: overrideTag(f, 'aatPin:' + (Number(pinned[1]) - 1)) };
    const area = x.text.match(/^Assigned area (\d+) .* reached/);
    if (area && task && task.type === 'aat') {
      const idx = Number(area[1]) - 1;
      return { act: o.aatPins && o.aatPins[idx] ? '' : timeForm('pinAat', f, 'Pin fix', '', '<input type="hidden" name="idx" value="' + idx + '">') };
    }
    return {};
  }

  function spine(ctx, f, r) {
    if (f.analysis.state === 'pending') return '<div class="wf-empty">Analysis is running. Uploaded ' + W.dt(f.uploadedAt) + '.</div>';
    const res = Q.resolve(f);
    const task = Q.task(ctx.cd);
    const all = contextEntries(f, res).concat(f.analysis.log);
    const showDebug = KH.ui.showDebug;
    const hidden = all.filter((x) => x.level === 'debug').length;
    const entries = all.filter((x) => showDebug || x.level !== 'debug');
    const untimed = entries.filter((x) => !x.time);
    const timed = entries.filter((x) => x.time);
    const row = (x) => {
      const a = rowActions(x, f, r, task);
      return '<tr class="log-' + x.level + (a.override ? ' d3-ov' : '') + '"><td class="mono nowrap d3-t">' + (x.time || '') + '</td><td>' + W.level(x.level) + '</td><td>' + e(x.text) + (x.rule ? '<span class="d3-rule">' + e(x.rule) + '</span>' : '') + '</td><td class="d3-act">' + (a.act || '') + '</td></tr>';
    };
    const group = (label) => '<tr class="d3-group"><td colspan="4">' + label + '</td></tr>';
    const lastStart = timed.map((x) => !!(x.kind === 'start' && x.candidate)).lastIndexOf(true);
    const o = f.overrides;
    const freeStartRow = f.analysis.candidates && f.analysis.candidates.length ? '<tr><td></td><td></td><td class="muted small">None of the crossings fits?</td><td class="d3-act">' + timeForm('freeStart', f, 'Set free start', o.start && o.start.kind === 'free' ? o.start.time : '') + '</td></tr>' : '';
    const rows = timed.map((x, i) => row(x) + (i === lastStart ? freeStartRow : '')).join('');
    return '<div class="wf-stack"><div class="wf-row between"><h3>Flight timeline · ' + e(f.name) + ' ' + W.staleBadge(f) + '</h3><button class="wf-btn small ghost" data-act="toggleDebug">' + (showDebug ? 'Hide' : 'Show') + ' ' + hidden + ' debug entries</button></div>' +
      (f.analysis.stale.length ? '<div class="wf-note warn">Stale since ' + W.dt(f.analysis.stale[0].at) + ': ' + e(f.analysis.stale.map((s) => s.reason).join(', ')) + '. The timeline below is from the previous run. <button class="wf-btn small primary" data-act="rerun" data-file="' + f.id + '">Rerun</button></div>' : '') +
      '<div class="d3-wrap"><table class="wf-table d3-log"><tbody>' +
      (untimed.length ? group('File and links') + untimed.map(row).join('') : '') +
      group('Flight') + (rows || '<tr><td colspan="4" class="muted">No timed entries.</td></tr>') +
      '</tbody></table></div>' +
      '<p class="muted small">Actions sit on the entry they concern. Marked rows are overrides. They belong to the file, stay when it is analysed again and follow it within its class day.</p></div>';
  }

  function review(ctx) {
    const r = ctx.result;
    const f = R.scoredFile(r);
    const head = '<div class="d3-head">' + R.reviewHeader(ctx) + '<div class="wf-row">' + R.reviewNav(ctx) + R.reviewButton(r) + '</div></div>';
    const top = '<div class="d3-top">' + box('Check reasons', R.rv.reasons(r), 'fill') +
      box('', R.rv.status(r) + '<div class="r2-wide" style="margin-top:8px">' + R.rv.files(r) + '</div>') + '</div>';
    const main = f
      ? '<div class="d3-main"><section class="wf-box d3-spine">' + spine(ctx, f, r) + '</section><aside class="d3-aside">' + R.rv.map(ctx, f, { h: 230 }) + box('Output', R.rv.summary(f)) + '</aside></div>'
      : '<div class="wf-empty">No scored file. ' + (Q.filesOfResult(r).length ? 'Pick one with "Score this file" above to see its timeline.' : 'No file resolves to this result yet. Set the status, or enter a manual result until the file arrives.') + '</div>';
    const draft = KH.ui.d3Draft && KH.ui.d3Draft.result === r.id ? KH.ui.d3Draft.text : '';
    let penalty = R.rv.penalty(r);
    if (draft && !r.penalty) penalty = penalty.replace('name="publicRemark" value=""', 'name="publicRemark" value="' + e(draft) + '"');
    return '<div class="wf-stack">' + head + top + main +
      box('Manual result', R.rv.manual(r)) +
      '<div class="d3-end">' + box('Penalty', penalty, draft ? 'fill' : '').replace('<section class="wf-box', '<section id="d3-penalty" class="wf-box') + '<section id="d3-remarks" class="wf-box"><h3>Remarks and handicap</h3>' + R.rv.remarks(r) + '</section></div></div>';
  }

  function scrollTo(id) {
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center' });
      const inp = el && el.querySelector && el.querySelector('input[name="points"], input[name="publicRemark"]');
      if (inp && inp.focus) inp.focus();
    }, 0);
  }

  R.mount({
    id: '3d',
    review,
    handlers: {
      d3Penalty(ds) {
        KH.ui.d3Draft = { result: ds.result, text: ds.text };
        scrollTo('d3-penalty');
      },
      d3Remark() {
        scrollTo('d3-remarks');
      },
    },
  });
})();
