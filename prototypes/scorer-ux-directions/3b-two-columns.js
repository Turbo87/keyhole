// PROTOTYPE: Round 3 prototype 3B, "Two columns". The result review page splits into the scorer's decision on the
// left and the evidence from the analysis on the right. The evidence column scrolls on its own, so the decision
// stays in view while reading the log.
(function () {
  const KH = window.KH;
  const R = KH.r3;
  const e = KH.esc;

  const box = (title, body) => (body ? '<section class="wf-box">' + (title ? '<h3>' + title + '</h3>' : '') + body + '</section>' : '');
  const wide = (html) => '<div class="r2-wide">' + html + '</div>';

  function review(ctx) {
    const r = ctx.result;
    const f = R.scoredFile(r);
    const head = '<div class="b3-head">' + R.reviewHeader(ctx) + '<div class="wf-row">' + R.reviewNav(ctx) + R.reviewButton(r) + '</div></div>';
    const decision = '<div class="b3-col wf-stack"><div class="b3-label"><span>Decision</span><a class="b3-jump" href="#" onclick="document.getElementById(\'b3-evidence\').scrollIntoView();return false">Jump to evidence ↓</a></div>' +
      box('Check reasons', R.rv.reasons(r)) +
      box('', R.rv.status(r)) +
      box('Files', wide(R.rv.files(r))) +
      box('Manual result', R.rv.manual(r)) +
      box('Penalty', R.rv.penalty(r)) +
      box('Remarks and handicap', R.rv.remarks(r)) + '</div>';
    const evidence = '<div class="b3-col b3-evidence wf-stack" id="b3-evidence"><div class="b3-label"><span>Evidence' + (f ? ' · ' + e(f.name) : '') + '</span></div>' +
      (f
        ? box('', '<div class="wf-cols"><div>' + R.rv.summary(f) + '</div>' + R.rv.map(ctx, f, { h: 200 }) + '</div>') +
          box('Start candidates', wide(R.rv.candidates(f))) +
          box('', wide(R.rv.log(f))) +
          box('Overrides', R.rv.overrides(f))
        : '<div class="wf-empty">No scored file. Pick a file on the left or enter a manual result.</div>') + '</div>';
    return head + '<div class="b3-cols">' + decision + evidence + '</div>';
  }

  R.mount({ id: '3b', review });
})();
