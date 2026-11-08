// PROTOTYPE: Round 3 prototype 3A, "Stacked". The result review page is one column in the order a scorer works
// through a result, under a sticky header that keeps the pilot, previous and next, and the Reviewed button in view.
(function () {
  const KH = window.KH;
  const R = KH.r3;
  const e = KH.esc;

  const box = (title, body, extra) => (body ? '<section class="wf-box a3-sec"' + (extra || '') + '>' + (title ? '<h3>' + title + '</h3>' : '') + body + '</section>' : '');

  function review(ctx) {
    const r = ctx.result;
    const f = R.scoredFile(r);
    const head = '<div class="a3-head">' + R.reviewHeader(ctx) + '<div class="wf-row">' + R.reviewNav(ctx) + R.reviewButton(r) + '</div></div>';
    return '<div class="wf-stack">' + head +
      box('Check reasons', R.rv.reasons(r)) +
      box('', R.rv.status(r)) +
      box('Files', '<div class="wf-table-wrap">' + R.rv.files(r) + '</div>') +
      (f ? box('Scored file: ' + e(f.name), '<div class="wf-cols"><div>' + R.rv.summary(f) + '</div>' + R.rv.map(ctx, f, { h: 220 }) + '</div>') +
        box('Start candidates', '<div class="wf-table-wrap">' + R.rv.candidates(f) + '</div>') +
        box('', '<div class="wf-table-wrap">' + R.rv.log(f) + '</div>') +
        box('Overrides', R.rv.overrides(f)) : '') +
      box('Manual result', R.rv.manual(r)) +
      box('Penalty', R.rv.penalty(r)) +
      box('Remarks and handicap', R.rv.remarks(r)) + '</div>';
  }

  R.mount({ id: '3a', review });
})();
