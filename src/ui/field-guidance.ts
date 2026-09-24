let masterCorrection:string|null=null
export function requestMasterCorrection(id:string):void { masterCorrection=id }
export function takeMasterCorrection():string|null {const id=masterCorrection;masterCorrection=null;return id}
/** Reveal nested disclosures and focus the visible correction control. Never edits data. */
export function focusCorrection(target:HTMLElement|null):void {
  if(!target)return
  target.dispatchEvent(new CustomEvent('reveal-correction',{bubbles:true}))
  for(let parent=target.parentElement;parent;parent=parent.parentElement)if(parent instanceof HTMLDetailsElement)parent.open=true
  document.querySelectorAll('.correction-target').forEach(element=>element.classList.remove('correction-target'))
  target.classList.add('correction-target')
  if(!target.matches('input,select,textarea,button,a,[tabindex]'))target.tabIndex=-1
  target.scrollIntoView({block:'center',behavior:'auto'});target.focus({preventScroll:true})
}
export function fieldHelp(scope:ParentNode,selector:string,message:string):void {
  scope.querySelectorAll<HTMLElement>(selector).forEach((field,index)=>{
    if(field.dataset.guidance)return
    field.dataset.guidance='true'
    const help=document.createElement('small');help.className='form-help field-guidance'
    help.id=`help-${field.id||field.getAttribute('name')||'field'}-${index}`
    help.textContent=message
    field.insertAdjacentElement('afterend',help)
    field.setAttribute('aria-describedby',[field.getAttribute('aria-describedby'),help.id].filter(Boolean).join(' '))
  })
}
