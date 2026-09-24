/** Add keyboard semantics to the legacy modal shells without changing save handlers. */
export function installDialogAccessibility(): void {
  let sequence=0
  let lastOutside:HTMLElement|null=null
  document.addEventListener('focusin',event=>{const target=event.target;if(target instanceof HTMLElement&&!target.closest('.modal'))lastOutside=target})
  const dialogs=new Map<HTMLElement,HTMLElement|null>()
  const focusable=(scope:HTMLElement)=>[...scope.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')].filter(item=>item.getClientRects().length>0)
  const sync=():void=>{
    for(const [dialog,previous] of dialogs)if(!dialog.isConnected){dialogs.delete(dialog);const remaining=[...dialogs.keys()].filter(item=>item.isConnected).pop();if(remaining)focusable(remaining)[0]?.focus({preventScroll:true});else if(previous?.isConnected)previous.focus({preventScroll:true})}
    document.querySelectorAll<HTMLElement>('.modal').forEach(dialog=>{
      if(!dialogs.has(dialog)){
        dialogs.set(dialog,lastOutside)
        dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true')
        const heading=dialog.querySelector<HTMLElement>('h2,h3')
        if(heading){heading.id||='dialog-title-'+(++sequence);dialog.setAttribute('aria-labelledby',heading.id)}
        if(!dialog.contains(document.activeElement))focusable(dialog)[0]?.focus()
      }
    })
    document.querySelectorAll<HTMLElement>('.form-group').forEach(group=>{
      const label=group.querySelector<HTMLLabelElement>('label'),control=group.querySelector<HTMLInputElement>('input:not([type="hidden"]),select,textarea')
      if(!label||!control||label.htmlFor||label.contains(control))return
      control.id||='field-'+(++sequence);label.htmlFor=control.id
    })
  }
  new MutationObserver(sync).observe(document.body,{childList:true,subtree:true})
  document.addEventListener('keydown',event=>{
    const dialog=[...dialogs.keys()].filter(item=>item.isConnected).pop()
    if(!dialog)return
    if(event.key==='Tab'){
      const items=focusable(dialog),first=items[0],last=items[items.length-1]
      if(!first){event.preventDefault();return}
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
    }
    if(event.key==='Escape'){
      const cancel=[...dialog.querySelectorAll<HTMLButtonElement>('button')].find(button=>/^(cancelar|fechar)$/i.test(button.textContent?.trim()??''))
      if(cancel&&!cancel.disabled){event.preventDefault();cancel.click()}
    }
  })
  sync()
}
