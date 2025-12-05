// Protótipo simples: carrega questions.json e navega pelas fases e questões.
// Observação: implementação intencionalmente simples para validar mecânicas.

let data = null;
let currentPhase = null;
let currentQuestionIndex = 0;
let phaseScores = {};

async function loadData() {
  const resp = await fetch('questions.json');
  data = await resp.json();
  renderPhaseButtons();
}

function renderPhaseButtons() {
  const container = document.getElementById('phase-buttons');
  container.innerHTML = '';
  data.phases.forEach((p, idx) => {
    const btn = document.createElement('button');
    btn.className = 'phase-btn';
    btn.textContent = `${p.title}`;
    btn.onclick = () => startPhase(idx);
    container.appendChild(btn);
  });
}

function startPhase(phaseIdx) {
  currentPhase = data.phases[phaseIdx];
  currentQuestionIndex = 0;
  phaseScores[currentPhase.id] = { total: 0, max: 0, results: [] };
  document.getElementById('phase-selection').classList.add('hidden');
  document.getElementById('final-summary').classList.add('hidden');
  document.getElementById('phase-summary').classList.add('hidden');
  document.getElementById('question-area').classList.remove('hidden');
  showQuestion();
}

function showQuestion() {
  const q = currentPhase.questions[currentQuestionIndex];
  const meta = document.getElementById('question-meta');
  meta.innerHTML = `<div class="meta">Fase: <strong>${currentPhase.title}</strong> — Indicador: ${currentPhase.indicator}</div>`;
  const cont = document.getElementById('question-content');
  cont.innerHTML = '';
  document.getElementById('feedback').classList.add('hidden');
  document.getElementById('feedback').classList.remove('ok','bad');

  // render by type
  const qText = document.createElement('div');
  qText.className = 'question-text';
  qText.textContent = q.enunciado;
  cont.appendChild(qText);

  if (q.type === 'mcq') {
    const opts = document.createElement('div');
    opts.className = 'options';
    q.opcoes.forEach((o, i) => {
      const div = document.createElement('div');
      div.className = 'option';
      div.textContent = o;
      div.onclick = () => handleMcq(q, i, div);
      opts.appendChild(div);
    });
    cont.appendChild(opts);
  } else if (q.type === 'calculo') {
    const p = document.createElement('div');
    p.className = 'small';
    p.textContent = q.meta || '';
    cont.appendChild(p);
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.001';
    input.className = 'input-number';
    input.id = 'calc-input';
    cont.appendChild(input);
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = 'Verificar';
    btn.onclick = () => handleCalculo(q);
    cont.appendChild(btn);
  } else if (q.type === 'sequencia') {
    const list = document.createElement('div');
    list.className = 'sequence-list';
    // shuffle to force ordering
    const passos = q.passos.map((p, i) => ({p,i})).sort(()=>Math.random()-0.5);
    passos.forEach(item => {
      const d = document.createElement('div');
      d.className = 'seq-item';
      d.textContent = item.p;
      d.draggable = true;
      d.dataset.origIndex = item.i;
      d.addEventListener('dragstart', dragStart);
      d.addEventListener('dragover', dragOver);
      d.addEventListener('drop', dropItem);
      list.appendChild(d);
    });
    cont.appendChild(list);
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = 'Verificar sequência';
    btn.onclick = () => handleSequencia(q);
    cont.appendChild(btn);
  } else if (q.type === 'associacao') {
    // simple matching using selects for prototype
    q.pares.forEach((par, idx) => {
      const box = document.createElement('div');
      box.className = 'card small';
      box.innerHTML = `<div><strong>${par.item}</strong></div>`;
      const select = document.createElement('select');
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Selecione o método';
      select.appendChild(opt);
      // gather unique respostas
      const respostas = q.pares.map(x => x.resposta);
      const unique = [...new Set(respostas)];
      unique.forEach(r => {
        const o = document.createElement('option');
        o.value = r;
        o.textContent = r;
        select.appendChild(o);
      });
      box.appendChild(select);
      cont.appendChild(box);
    });
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = 'Verificar associações';
    btn.onclick = () => handleAssociacao(q);
    cont.appendChild(btn);
  } else if (q.type === 'decisao') {
    const opts = document.createElement('div');
    opts.className = 'options';
    q.opcoes.forEach((o, i) => {
      const div = document.createElement('div');
      div.className = 'option';
      div.textContent = o;
      div.onclick = () => handleDecision(q, i, div);
      opts.appendChild(div);
    });
    cont.appendChild(opts);
  }

  // reset action buttons
  document.getElementById('next-button').classList.add('hidden');
  document.getElementById('end-phase-button').classList.add('hidden');
}

function handleMcq(q, index, element) {
  // mark selection
  document.querySelectorAll('.option').forEach(e=>e.classList.remove('selected'));
  element.classList.add('selected');

  const ok = index === q.resposta_correta;
  showFeedback(ok, q.explicacao);
  registerResult(q, ok ? q.peso : 0, q.peso);
  prepareNext();
}

function handleCalculo(q) {
  const val = parseFloat(document.getElementById('calc-input').value);
  const fb = document.getElementById('feedback');
  if (isNaN(val)) {
    fb.className = 'feedback bad';
    fb.textContent = 'Digite um número válido.';
    fb.classList.remove('hidden');
    return;
  }
  const diff = Math.abs(val - q.resposta);
  const ok = diff <= (q.tolerancia || 0.01);
  showFeedback(ok, q.explicacao + (ok ? '' : ` (Valor esperado ≈ ${q.resposta.toFixed(3)})`));
  registerResult(q, ok ? q.peso : 0, q.peso);
  prepareNext();
}

function handleSequencia(q) {
  // read current order by origIndex
  const items = Array.from(document.querySelectorAll('.seq-item'));
  const order = items.map(it => parseInt(it.dataset.origIndex));
  const okCount = order.reduce((acc, val, idx) => acc + (val === q.resposta_correta[idx] ? 1 : 0), 0);
  const ok = okCount === q.resposta_correta.length;
  const partial = okCount / q.resposta_correta.length;
  showFeedback(ok || partial>0, q.explicacao + (ok ? '' : ` (${okCount}/${q.resposta_correta.length} corretos)`));
  registerResult(q, Math.round((q.peso*okCount)/q.resposta_correta.length), q.peso);
  prepareNext();
}

function handleAssociacao(q) {
  const selects = Array.from(document.querySelectorAll('select'));
  let correct = 0;
  selects.forEach((s, i) => {
    if (s.value === q.pares[i].resposta) correct++;
  });
  const ok = correct === q.pares.length;
  showFeedback(ok, q.explicacao + (ok ? '' : ` (${correct}/${q.pares.length} corretas)`));
  registerResult(q, Math.round((q.peso*correct)/q.pares.length), q.peso);
  prepareNext();
}

function handleDecision(q, index, element) {
  document.querySelectorAll('.option').forEach(e=>e.classList.remove('selected'));
  element.classList.add('selected');
  const ok = index === q.resposta_correta;
  showFeedback(ok, q.explicacao);
  registerResult(q, ok ? q.peso : 0, q.peso);
  prepareNext();
}

function showFeedback(ok, explicacao) {
  const fb = document.getElementById('feedback');
  fb.classList.remove('hidden');
  if (ok) {
    fb.classList.add('ok');
    fb.classList.remove('bad');
  } else {
    fb.classList.add('bad');
    fb.classList.remove('ok');
  }
  fb.innerHTML = `<strong>${ok ? 'Correto' : 'Incorreto'}</strong><div class="small" style="margin-top:6px">${explicacao}</div>`;
}

function registerResult(q, pointsObtained, pointsMax) {
  const rec = phaseScores[currentPhase.id];
  rec.total += pointsObtained;
  rec.max += pointsMax;
  rec.results.push({ id: q.id, obtained: pointsObtained, max: pointsMax, indicator: currentPhase.indicator });
}

function prepareNext() {
  if (currentQuestionIndex < currentPhase.questions.length - 1) {
    document.getElementById('next-button').classList.remove('hidden');
    const nextBtn = document.getElementById('next-button');
    nextBtn.onclick = () => {
      currentQuestionIndex++;
      showQuestion();
    };
  } else {
    // end of phase
    document.getElementById('end-phase-button').classList.remove('hidden');
    const endBtn = document.getElementById('end-phase-button');
    endBtn.onclick = () => showPhaseSummary();
  }
}

function showPhaseSummary() {
  document.getElementById('question-area').classList.add('hidden');
  const sec = document.getElementById('phase-summary');
  sec.classList.remove('hidden');
  const res = document.getElementById('phase-results');
  const rec = phaseScores[currentPhase.id];
  const pct = rec.max ? Math.round((rec.total/rec.max)*100) : 0;
  // map para "Bem / Mais ou Menos / Não Fui Bem"
  const nivel = pct >= 80 ? 'Bem' : pct >= 50 ? 'Mais ou Menos' : 'Não Fui Bem';
  res.innerHTML = `<p><strong>${currentPhase.title}</strong></p>
    <p class="small">Pontuação: ${rec.total}/${rec.max} (${pct}%)</p>
    <p class="small">Mapa de Dificuldade: <strong>${nivel}</strong></p>`;
  document.getElementById('back-to-phases').onclick = () => {
    document.getElementById('phase-summary').classList.add('hidden');
    document.getElementById('phase-selection').classList.remove('hidden');
    // check if all phases done => show final summary
    checkAllPhasesDone();
  };
}

function checkAllPhasesDone() {
  // if all phases have entries in phaseScores -> final summary
  const doneCount = data.phases.filter(p => phaseScores[p.id] && phaseScores[p.id].max>0).length;
  if (doneCount === data.phases.length) {
    showFinalSummary();
  }
}

function showFinalSummary() {
  const sec = document.getElementById('final-summary');
  sec.classList.remove('hidden');
  const cont = document.getElementById('final-results');
  let total = 0, max = 0;
  Object.values(phaseScores).forEach(r => { total += r.total; max += r.max; });
  const pct = max ? Math.round((total/max)*100) : 0;
  cont.innerHTML = `<p class="small">Pontuação total: ${total}/${max} (${pct}%)</p>`;
  // mostrar resumo por fase
  cont.innerHTML += '<h4>Resumo por Fase</h4>';
  data.phases.forEach(p => {
    const r = phaseScores[p.id] || { total:0, max:0 };
    const pctp = r.max ? Math.round((r.total/r.max)*100) : 0;
    cont.innerHTML += `<div class="small"><strong>${p.title}</strong>: ${r.total}/${r.max} (${pctp}%)</div>`;
  });
  document.getElementById('restart-button').onclick = () => location.reload();
}

function dragStart(e) {
  e.dataTransfer.setData('text/plain', e.target.dataset.origIndex);
}
function dragOver(e) {
  e.preventDefault();
}
function dropItem(e) {
  e.preventDefault();
  const fromIndex = e.dataTransfer.getData('text/plain');
  const toElem = e.target;
  // swap nodes by dataset.origIndex
  const list = toElem.parentElement;
  const fromElem = Array.from(list.children).find(ch => ch.dataset.origIndex === fromIndex);
  if (!fromElem || fromElem === toElem) return;
  list.insertBefore(fromElem, toElem);
}

// inicializa
loadData();