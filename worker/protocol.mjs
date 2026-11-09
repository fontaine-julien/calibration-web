// This module is server-only. No campaign, seed, answer key or item list is public.
function integer(max) {
  const ceiling = Math.floor(0x100000000 / max) * max;
  let n;
  do { n = crypto.getRandomValues(new Uint32Array(1))[0]; } while (n >= ceiling);
  return n % max;
}
function shuffle(input) {
  const values = [...input];
  for (let i = values.length - 1; i > 0; i--) {
    const j = integer(i + 1);
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}
export function generateProtocol() {
  const left = shuffle(Array.from({length:10}, (_, i) => i + 1));
  const right = shuffle(left);
  const shifts = shuffle(Array.from({length:10}, (_, i) => i)).slice(0, 5);
  const pairs = left.flatMap((a, i) => shifts.map(shift => {
    const b = right[(i + shift) % 10];
    return {a, b, pair: `${a}x${b}`};
  }));
  return [...shuffle(pairs).map(p => ({...p, phase:'copy'})),
    ...shuffle(pairs).map(p => ({...p, phase:'tables'}))];
}
export function publicItem(item, index, nonce) {
  return {index, nonce, phase:item.phase, position:index % 50 + 1, total:50,
    prompt:item.phase === 'copy' ? String(item.a * item.b) : `${item.a} × ${item.b}`,
    maxDigits:item.a * item.b === 100 ? 3 : 2};
}
export function validateAnswer(body, item) {
  if (!Array.isArray(body.events) || body.events.length < 1 || body.events.length > 500) return null;
  let answer = '', previous = 0, first = null, last = 0, corrections = 0;
  const max = item.a * item.b === 100 ? 3 : 2;
  for (const event of body.events) {
    if (!event || !Number.isFinite(event.ms) || event.ms < previous || event.ms > 3600000) return null;
    previous = event.ms;
    if (event.type === 'digit' && /^[0-9]$/.test(event.value) && answer.length < max) {
      answer += event.value;
      if (first === null) first = event.ms;
    } else if (event.type === 'backspace' && answer.length) {
      answer = answer.slice(0, -1); corrections++;
    } else return null;
    last = event.ms;
  }
  if (!answer || answer !== body.answer || first === null ||
      !Number.isFinite(body.enterMs) || body.enterMs < last || body.enterMs > 3600000) return null;
  return {answer, first, last, corrections, enter:body.enterMs,
    correct:answer === String(item.a * item.b) ? 1 : 0};
}
export function summarize(rows) {
  const copy = new Map(rows.filter(r => r.phase === 'copy' && r.correct).map(r => [r.pair_id, r.last_ms]));
  const pairs = rows.filter(r => r.phase === 'tables' && r.correct && copy.has(r.pair_id));
  const mean = fn => pairs.length ? pairs.reduce((sum, r) => sum + fn(r), 0) / pairs.length / 1000 : null;
  return {pairs:pairs.length, copySeconds:mean(r => copy.get(r.pair_id)),
    tablesSeconds:mean(r => r.last_ms), differenceSeconds:mean(r => r.last_ms - copy.get(r.pair_id)),
    copyCorrect:rows.filter(r => r.phase === 'copy' && r.correct).length,
    tablesCorrect:rows.filter(r => r.phase === 'tables' && r.correct).length,
    answered:rows.length};
}
