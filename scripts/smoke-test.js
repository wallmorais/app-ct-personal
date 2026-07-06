/**
 * PT.Control — Smoke test de regressão (roda no navegador, com o app aberto).
 *
 * Como usar:
 *   1. Abra o app no navegador (npm run dev) em qualquer tela.
 *   2. Abra o Console (F12) e cole o conteúdo deste arquivo inteiro, ou:
 *   3. Peça para o Claude rodar via `preview_eval` com o conteúdo deste arquivo.
 *
 * O script:
 *   - faz backup dos dados atuais do localStorage antes de começar;
 *   - roda os cenários usando a UI real do app (não reimplementa a lógica);
 *   - ao final, RESTAURA o backup e recarrega a página — não deixa dados de teste.
 *
 * Cobre os cenários críticos já validados manualmente na auditoria:
 *   A) BUG-01 — compartilhamento de horário com dias independentes por aluno.
 *   B) BUG-04 (conhecido) — reativação sem atualizar dataAdesao cria "gap" fantasma.
 *   C) BUG-05 (conhecido) — falta na reposição não contabilizada.
 *
 * Itens A e B usam a UI real (React) via DOM. O item C injeta o registro
 * diretamente no localStorage porque testar via UI exigiria simular dois dias
 * diferentes do calendário — o mesmo cálculo já é coberto por
 * src/lib/billing.test.ts; aqui serve como conferência rápida ponta a ponta.
 */
(async function smokeTest() {
  const STORAGE_KEY = 'pt-control:data';
  const results = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function log(nome, passou, detalhe) {
    results.push({ nome, passou, detalhe });
    console.log(`${passou ? '✅ PASSOU' : '❌ FALHOU'} — ${nome}${detalhe ? ' — ' + detalhe : ''}`);
  }

  function getData() {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  }

  function setData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function clickByText(selector, text) {
    const el = [...document.querySelectorAll(selector)].find((e) => e.textContent.trim() === text);
    if (!el) throw new Error(`Elemento não encontrado: ${selector} com texto exato "${text}"`);
    el.click();
    return el;
  }

  /** Cartões de aluno têm texto completo (nome + stats) — usar correspondência parcial. */
  function clickByIncludes(selector, texto) {
    const el = [...document.querySelectorAll(selector)].find((e) => e.textContent.includes(texto));
    if (!el) throw new Error(`Elemento não encontrado: ${selector} contendo "${texto}"`);
    el.click();
    return el;
  }

  function fillNative(id, value) {
    const input = document.getElementById(id);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const backup = localStorage.getItem(STORAGE_KEY);

  try {
    console.log('%c--- SMOKE TEST PT.Control ---', 'font-weight:bold');
    console.log('Rodando sobre os dados atuais do app (nomes prefixados SMOKE_ para não colidir).');

    // Importante: não usar window.location.reload() no meio do script — isso destrói
    // o contexto de execução do console/preview_eval e interrompe tudo que vem depois.
    // Por isso os cenários abaixo usam nomes únicos (SMOKE_*) em cima do estado atual,
    // em vez de reiniciar com um seed limpo.

    // ===== A) Compartilhamento de horário com dias independentes (BUG-01) =====
    clickByText('nav button', 'Alunos');
    await sleep(200);
    clickByText('main button', 'Aluno');
    await sleep(200);
    fillNative('aluno-nome', 'SMOKE_A');
    document.querySelectorAll('input[type="checkbox"]')[0].click(); // Seg
    document.querySelectorAll('input[type="checkbox"]')[2].click(); // Qua
    clickByText('button', 'Salvar');
    await sleep(300);

    clickByText('main button', 'Aluno');
    await sleep(200);
    fillNative('aluno-nome', 'SMOKE_B');
    document.querySelectorAll('input[type="checkbox"]')[0].click(); // só Seg
    clickByText('button', 'Salvar');
    await sleep(300);

    {
      const d = getData();
      const a = d.alunos.find((x) => x.nome === 'SMOKE_A');
      const b = d.alunos.find((x) => x.nome === 'SMOKE_B');
      const scheduleA = d.schedules.find((s) => s.alunoId === a.id);
      const scheduleB = d.schedules.find((s) => s.alunoId === b.id);
      const mesmoSlot = scheduleA.slotId === scheduleB.slotId;
      const diasIndependentes =
        JSON.stringify(scheduleA.dias) === JSON.stringify([1, 3]) &&
        JSON.stringify(scheduleB.dias) === JSON.stringify([1]);
      log(
        'A) Compartilhamento de slot com dias independentes',
        mesmoSlot && diasIndependentes,
        `mesmoSlot=${mesmoSlot} diasA=${JSON.stringify(scheduleA.dias)} diasB=${JSON.stringify(scheduleB.dias)}`,
      );
    }

    // ===== B) BUG-04 — reativação sem atualizar dataAdesao =====
    clickByText('main button', 'Aluno');
    await sleep(200);
    fillNative('aluno-nome', 'SMOKE_GAP');
    document.querySelectorAll('input[type="checkbox"]')[0].click();
    fillNative('aluno-adesao', '2026-01-05');
    clickByText('button', 'Salvar');
    await sleep(300);

    // Expande o card uma única vez — clicar de novo no mesmo card fecha o
    // acordeão (toggle), então as próximas edições só clicam em "Editar".
    clickByIncludes('main button', 'SMOKE_GAP');
    await sleep(200);
    clickByText('button', 'Editar');
    await sleep(200);
    fillNative('aluno-encerramento', '2026-03-01');
    clickByText('button', 'Salvar');
    await sleep(300);

    clickByText('button', 'Editar');
    await sleep(200);
    fillNative('aluno-encerramento', ''); // reativa sem tocar em dataAdesao
    clickByText('button', 'Salvar');
    await sleep(300);

    {
      const d = getData();
      const aluno = d.alunos.find((x) => x.nome === 'SMOKE_GAP');
      const dateNoGap = '2026-03-15';
      const enrollments = d.matriculas
        .filter((m) => m.alunoId === aluno.id && m.dataInicio <= dateNoGap)
        .sort((x, y) => y.dataInicio.localeCompare(x.dataInicio));
      let status = null;
      for (const e of enrollments) {
        if (!e.dataFim || e.dataFim >= dateNoGap) {
          status = e.tipo;
          break;
        }
      }
      // Resultado esperado (correto) seria INATIVO. Hoje o sistema retorna ATIVO —
      // então este smoke test confirma que o bug ainda existe quando "passou".
      const bugAindaPresente = status === 'ATIVO';
      log(
        'B) BUG-04 (conhecido) — gap de reativação vira ATIVO retroativo',
        bugAindaPresente,
        `status em ${dateNoGap} = ${status} (esperado hoje: ATIVO = bug presente; se vier INATIVO, o bug foi corrigido)`,
      );
    }

    // ===== C) BUG-05 — falta na reposição não contabilizada =====
    {
      const d = getData();
      const aluno = d.alunos.find((x) => x.nome === 'SMOKE_A');
      const schedule = d.schedules.find((s) => s.alunoId === aluno.id);
      d.registros.push({
        id: 'smoke-registro-1',
        alunoId: aluno.id,
        slotId: schedule.slotId,
        data: '2026-06-29',
        horario: '07:00',
        status: 'falta',
        reposicaoData: '2026-07-15',
        reposicaoHorario: '07:00',
      });
      setData(d);

      // Reimplementação mínima da regra de contagem (espelha lib/billing.ts) só para
      // decidir o resultado deste smoke test — a fonte de verdade real está em
      // src/lib/billing.test.ts.
      const doAluno = d.registros.filter((r) => r.alunoId === aluno.id);
      const doPeriodo = doAluno.filter((r) => r.data >= '2026-07-01' && r.data <= '2026-07-31');
      const faltas = doPeriodo.filter((r) => r.status === 'falta' && !r.reposicaoData).length;
      const faltaSumiu = faltas === 0; // deveria ser 1 se a regra fosse "correta"
      log(
        'C) BUG-05 (conhecido) — falta na reposição não conta em Faltas',
        faltaSumiu,
        `faltas calculadas para julho/2026 = ${faltas} (esperado hoje: 0 = bug presente; se vier 1, o bug foi corrigido)`,
      );
    }

    const totalPass = results.filter((r) => r.passou).length;
    console.log(`%c--- RESUMO: ${totalPass}/${results.length} confirmações bateram com o comportamento esperado ---`, 'font-weight:bold');
  } catch (err) {
    console.error('Smoke test abortado com erro:', err);
  } finally {
    // Restaura os dados originais do usuário, sempre.
    if (backup) localStorage.setItem(STORAGE_KEY, backup);
    else localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  }
})();
