// Enhance every month picker, including forms created after module navigation.
export function installMonthNavigation(): void {
  const enhance=():void=>{
    document.querySelectorAll<HTMLInputElement>('input[type="month"]').forEach(input=>{
      if(input.dataset.monthNavigation) return
      input.dataset.monthNavigation='true'
      const parent=input.parentElement!
      const existing=parent.classList.contains('agenda-toolbar')
      const wrapper=existing?parent:document.createElement('div')
      if(!existing){input.before(wrapper);wrapper.append(input)}
      wrapper.classList.add('month-navigation')
      if(existing) wrapper.querySelectorAll<HTMLButtonElement>('button[aria-label="Mês anterior"],button[aria-label="Próximo mês"]').forEach(button=>button.remove())
      for(const [step,label] of [[-1,'Anterior'],[1,'Próximo']] as const){
        const button=document.createElement('button')
        button.type='button';button.className='btn btn-ghost';button.textContent=label
        button.setAttribute('aria-label',step<0?'Mês anterior':'Próximo mês')
        button.addEventListener('click',()=>{
          if(input.disabled||input.readOnly||!/^\d{4}-\d{2}$/.test(input.value)) return
          const [year,month]=input.value.split('-').map(Number)
          const date=new Date(Date.UTC(year!,month!-1+step,1)),next=date.toISOString().slice(0,7)
          if((input.min&&next<input.min)||(input.max&&next>input.max)) return
          const previous=input.value
          input.value=next
          if(!input.dispatchEvent(new Event('change',{bubbles:true,cancelable:true})))input.value=previous
        })
        if(step<0) wrapper.prepend(button);else wrapper.append(button)
      }
    })
  }
  enhance()
  new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true})
}
