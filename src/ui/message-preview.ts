import { whatsappPhone } from '../modules/message-domain'

export function showMessagePreview(options:{id:string;title:string;message:string;phone?:string;allowNoPhone?:boolean;toast:(message:string)=>void}):void {
  if(!options.message.trim()){options.toast('Nenhuma informação para enviar.');return}
  document.getElementById(options.id)?.remove()
  const dialog=document.createElement('dialog')
  dialog.id=options.id
  dialog.style.cssText='width:min(600px,calc(100vw - 32px));max-height:85vh;border:1px solid var(--border);border-radius:12px;padding:18px'
  const heading=document.createElement('h3');heading.textContent=options.title
  const help=document.createElement('p');help.textContent='Confira e ajuste o texto antes de abrir o WhatsApp. O envio é manual.'
  const field=document.createElement('textarea');field.className='form-input';field.rows=14;field.setAttribute('aria-label',options.title);field.value=options.message
  const actions=document.createElement('div');actions.className='scale-actions'
  actions.innerHTML='<button type="button" data-open class="btn btn-primary">Abrir no WhatsApp</button><button type="button" data-copy class="btn btn-ghost">Copiar</button><button type="button" data-close class="btn btn-ghost">Fechar</button>'
  dialog.append(heading,help,field,actions)
  document.body.append(dialog)
  dialog.querySelector('[data-open]')!.addEventListener('click',()=>{
    const digits=options.phone===undefined&&options.allowNoPhone?'':whatsappPhone(options.phone??'')
    if(digits===null||(!digits&&!options.allowNoPhone)){options.toast('Cadastre um telefone com DDD ou copie a mensagem.');return}
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(field.value)}`,'_blank','noopener,noreferrer')
  })
  dialog.querySelector('[data-copy]')!.addEventListener('click',()=>{void navigator.clipboard.writeText(field.value).then(()=>options.toast('Mensagem copiada')).catch(()=>options.toast('Não foi possível copiar. Selecione o texto da mensagem.'))})
  dialog.querySelector('[data-close]')!.addEventListener('click',()=>dialog.close())
  dialog.addEventListener('close',()=>dialog.remove())
  dialog.showModal()
}
