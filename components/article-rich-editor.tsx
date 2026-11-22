'use client';

import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';

type Props={initial:string;label:string;disabled:boolean;onEdit:(html:string|null)=>void;onError:(message:string)=>void;onUpload:(busy:boolean)=>void};
export function ArticleRichEditor({initial,label,disabled,onEdit,onError,onUpload}:Props) {
  const baseline=useRef('');
  const upload=useRef<HTMLInputElement>(null);
  const [link,setLink]=useState<string|null>(null);
  const editor=useEditor({
    immediatelyRender:false,
    extensions:[StarterKit.configure({heading:{levels:[2,3]},code:false,codeBlock:false,strike:false,link:{openOnClick:false,defaultProtocol:'https'}}),Image.configure({allowBase64:false})],
    content:initial,
    editorProps:{attributes:{role:'textbox','aria-label':label,'aria-multiline':'true','data-placeholder':'Начните писать…'}},
    onCreate:({editor})=>{baseline.current=editor.getHTML();},
    onUpdate:({editor})=>{const html=editor.getHTML();onEdit(html===baseline.current?null:html);},
  });
  const active=useEditorState({editor,selector:({editor:e})=>({
    bold:e?.isActive('bold'),italic:e?.isActive('italic'),underline:e?.isActive('underline'),quote:e?.isActive('blockquote'),
    bullets:e?.isActive('bulletList'),numbers:e?.isActive('orderedList'),link:e?.isActive('link'),
    block:e?.isActive('heading',{level:2})?'2':e?.isActive('heading',{level:3})?'3':'p',
    undo:e?.can().undo(),redo:e?.can().redo(),
  })});
  useEffect(()=>{editor?.setEditable(!disabled,false);},[editor,disabled]);
  if(!editor||!active)return <p>Загрузка редактора…</p>;
  const chain=()=>editor.chain().focus();
  const button=(name:string,icon:string,action:()=>unknown,pressed?:boolean,off=false)=>
    <button type="button" aria-label={name} title={name} aria-pressed={pressed} disabled={disabled||off}
      onMouseDown={e=>e.preventDefault()} onClick={action}>{icon}</button>;
  async function image(file?:File) {
    if(!file||!editor)return;
    const position=editor.state.selection.from;
    onUpload(true);
    try {
      if(file.size>8*1024*1024)throw new Error('Максимальный размер изображения 8 МБ.');
      const response=await fetch('/api/admin/content-image',{method:'POST',body:file});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Не удалось загрузить изображение.');
      editor.chain().focus().setTextSelection(position).setImage({src:data.url,alt:''}).run();
    }catch(err){onError((err as Error).message);}finally{onUpload(false);}
  }
  function applyLink(){
    const value=link?.trim()||'';
    if(value && !/^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(value)){onError('Введите полный адрес ссылки или путь на сайте.');return;}
    const selection=chain().extendMarkRange('link');
    if(value)selection.setLink({href:value}).run();else selection.unsetLink().run();
    setLink(null);
  }
  return <section className="rich-paper" aria-label={label}>
    <div className="rich-tools" role="toolbar" aria-label="Форматирование">
      <select aria-label="Стиль текста" disabled={disabled} value={active.block} onChange={e=>e.target.value==='p'?chain().setParagraph().run():chain().setHeading({level:Number(e.target.value) as 2|3}).run()}>
        <option value="p">Абзац</option><option value="2">Подзаголовок H2</option><option value="3">Подзаголовок H3</option>
      </select>
      {button('Полужирный','Ж',()=>chain().toggleBold().run(),active.bold)}
      {button('Курсив','К',()=>chain().toggleItalic().run(),active.italic)}
      {button('Подчёркнутый','Ч',()=>chain().toggleUnderline().run(),active.underline)}
      {button('Маркированный список','• Список',()=>chain().toggleBulletList().run(),active.bullets)}
      {button('Нумерованный список','1. Список',()=>chain().toggleOrderedList().run(),active.numbers)}
      {button('Цитата','❝',()=>chain().toggleBlockquote().run(),active.quote)}
      {button('Ссылка','Ссылка',()=>setLink(editor.getAttributes('link').href||''),active.link)}
      {button('Вставить изображение','Фото',()=>upload.current?.click())}
      {button('Отменить ввод','↶',()=>chain().undo().run(),undefined,!active.undo)}
      {button('Повторить ввод','↷',()=>chain().redo().run(),undefined,!active.redo)}
      <input hidden type="file" ref={upload} accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Файл изображения" onChange={e=>{image(e.target.files?.[0]);e.target.value='';}}/>
    </div>
    {link!==null&&<div className="rich-link"><label>Адрес ссылки<input autoFocus value={link} placeholder="https://" onChange={e=>setLink(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')applyLink();if(e.key==='Escape')setLink(null);}}/></label><button type="button" onClick={applyLink}>Применить</button><button type="button" onClick={()=>setLink(null)}>Закрыть</button></div>}
    <EditorContent editor={editor}/>
  </section>;
}

