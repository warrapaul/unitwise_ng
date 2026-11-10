export default async ({ b, sleep, evalJs, shot }) => {
  const q = (js) => evalJs(b, js);
  console.log('rows', await q(`document.querySelectorAll('tbody tr').length`), '| record buttons', await q(`[...document.querySelectorAll('button')].filter(x => x.textContent.trim() === 'Record').length`),
    '| bulk button', await q(`[...document.querySelectorAll('button')].some(x => /^Record \\d+ reading/.test(x.textContent.trim()))`), '| inputs in table', await q(`document.querySelectorAll('tbody input').length`));
  await q(`[...document.querySelectorAll('button')].filter(x => x.textContent.trim() === 'Record')[1].click()`); await sleep(700);
  console.log('dialog', await q(`document.querySelector('app-dialog')?.innerText.replace(/\\s+/g,' ').slice(0,200)`));
  await shot(b, '/tmp/claude-1000/-home-warra-Documents-work-ng-unitwise-ng/c26c99c4-54e0-450e-8b12-099a9c749679/scratchpad/h/' + process.env.TAG + '-mr-dialog.png');
  await q(`document.querySelector('app-dialog .icon-action')?.click()`); await sleep(400);
};
