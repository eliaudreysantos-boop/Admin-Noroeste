import type { AppContext } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Módulo Programação — wrapper de integração
//
// O módulo Programação é um app React + TypeScript separado, recebido pronto
// de terceiro (S-89, S-140, lembretes WhatsApp, escalas). Não é reescrito aqui.
//
// Duas estratégias de integração:
//   OPÇÃO A (ativa)  — iframe apontando pro app React hospedado à parte na Netlify.
//   OPÇÃO B (comentada, no fim do arquivo) — import() dinâmico do código React,
//            montado numa div dentro do próprio Admin SPA.
//
// Para trocar de A para B quando o código React estiver disponível na mesma
// pasta do projeto (ex.: `src/modules/programacao-react/main.tsx`):
//   1. Comente o `export default function mount` da Opção A abaixo.
//   2. Descomente o bloco "OPÇÃO B" no fim do arquivo.
//   3. Garanta que `programacao-react/main.tsx` exporte:
//        export function mountProgramacao(el: HTMLElement, ctx: AppContext): void
//        export function unmountProgramacao(el: HTMLElement): void
// ─────────────────────────────────────────────────────────────────────────────

/** URL do app Programação standalone. Trocar pela URL real de produção. */
const PROGRAMACAO_URL = 'https://SEU-APP-PROGRAMACAO.netlify.app'

// ─── OPÇÃO A — iframe (ativa) ────────────────────────────────────────────────

export default function mount(_ctx: AppContext): void {
  const el = document.getElementById('appContent')
  if (!el) return

  el.innerHTML = `
    <style>
      @keyframes programacaoSpin { to { transform: rotate(360deg) } }
      .programacao-spinner {
        width: 28px; height: 28px; border-radius: 50%;
        border: 3px solid var(--border); border-top-color: var(--blue-deep);
        animation: programacaoSpin .8s linear infinite;
      }
    </style>
    <div style="display:flex;flex-direction:column;height:calc(100dvh - var(--header-h) - var(--bottom-h))">
      <div style="padding:8px 0 10px;font-size:.78rem;color:var(--ink-3);text-align:center">
        Módulo Programação — abre no app externo
      </div>
      <div id="programacaoWrap" style="position:relative;flex:1">
        <div id="programacaoLoading" style="position:absolute;inset:0;display:flex;
          flex-direction:column;align-items:center;justify-content:center;gap:10px;
          background:var(--bg);border-radius:var(--radius)">
          <div class="programacao-spinner" aria-hidden="true"></div>
          <span style="font-size:.8rem;color:var(--ink-3)">Carregando Programação…</span>
        </div>
        <iframe
          id="programacaoFrame"
          src="${PROGRAMACAO_URL}"
          style="position:relative;flex:1;border:none;border-radius:var(--radius);width:100%;height:100%"
          title="Programação"
          allow="clipboard-write"
        ></iframe>
      </div>
    </div>`

  const loading = document.getElementById('programacaoLoading')
  const frame = document.getElementById('programacaoFrame') as HTMLIFrameElement | null
  frame?.addEventListener('load', () => {
    loading?.remove()
  })
}

// ─── OPÇÃO B — import dinâmico (comentada — descomentar quando o código
//     React estiver na mesma pasta do projeto) ───────────────────────────────
//
// let _unmount: ((el: HTMLElement) => void) | null = null
//
// export default async function mount(ctx: AppContext): Promise<void> {
//   const el = document.getElementById('appContent')
//   if (!el) return
//   el.innerHTML = '<div id="programacao-root"></div>'
//   const { mountProgramacao, unmountProgramacao } = await import('./programacao-react/main')
//   const root = document.getElementById('programacao-root')!
//   mountProgramacao(root, ctx)
//   _unmount = unmountProgramacao
// }
//
// // Chamar ao trocar de módulo/rota, se o router suportar um hook de saída:
// export function unmount(): void {
//   const root = document.getElementById('programacao-root')
//   if (root && _unmount) _unmount(root)
//   _unmount = null
// }
