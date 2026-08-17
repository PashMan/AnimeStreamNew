import React, { useRef, useState } from 'react';
import { Bold, Italic, Underline, Quote, Image as ImageIcon, Loader2 } from 'lucide-react';

interface RichTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit?: () => void;
}

export const RichTextarea: React.FC<RichTextareaProps> = ({ value, onChange, onSubmit, className, ...props }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const insertTag = (tag: string, customText?: string) => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const text = textareaRef.current.value;
    const before = text.substring(0, start);
    const selection = text.substring(start, end);
    const after = text.substring(end);

    let newText = '';
    let newCursorPos = 0;

    if (customText) {
        newText = `${before}${customText}${after}`;
        newCursorPos = start + customText.length;
    } else if (tag === 'b') {
        newText = `${before}**${selection}**${after}`;
        newCursorPos = start + 2 + selection.length + 2; // Move after closing **
        if (!selection) newCursorPos -= 2; // If no selection, put cursor inside
    } else if (tag === 'i') {
        newText = `${before}_${selection}_${after}`;
        newCursorPos = start + 1 + selection.length + 1;
        if (!selection) newCursorPos -= 1;
    } else if (tag === 'u') {
        newText = `${before}<u>${selection}</u>${after}`;
        newCursorPos = start + 3 + selection.length + 4;
        if (!selection) newCursorPos -= 4;
    } else if (tag === 'q') {
        const quoteText = selection || 'Цитата';
        newText = `${before}\n> ${quoteText}\n${after}`;
        newCursorPos = start + 3 + quoteText.length + 1;
        if (!selection) newCursorPos -= (quoteText.length + 1);
    }

    // Trigger change manually since we modified the value programmatically
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    if (nativeInputValueSetter) {
        nativeInputValueSetter.call(textareaRef.current, newText);
    }
    
    const event = { target: textareaRef.current } as React.ChangeEvent<HTMLTextAreaElement>;
    onChange(event);
    
    // Restore focus and cursor
    setTimeout(() => {
        if (textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
    }, 0);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      
      const res = await fetch(`https://api.imgbb.com/1/upload?key=edaf6038f244328baa974ec34e44dd7f`, {
        method: 'POST',
        body: formData
      });
      
      const data = await res.json();
      if (data.success) {
        const imageUrl = data.data.url;
        insertTag('img', `\n![Изображение](${imageUrl})\n`);
      } else {
        console.error('ImgBB upload failed:', data);
        alert('Ошибка при загрузке изображения');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Ошибка при загрузке изображения');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-0 group">
        <div className="flex gap-1 bg-surface/50 p-1.5 rounded-t-xl border border-white/10 border-b-0 w-fit self-start translate-y-[1px] z-10">
            <button type="button" onClick={() => insertTag('b')} className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors" title="Жирный"><Bold className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={() => insertTag('i')} className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors" title="Курсив"><Italic className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={() => insertTag('u')} className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors" title="Подчеркнутый"><Underline className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={() => insertTag('q')} className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors" title="Цитата"><Quote className="w-3.5 h-3.5" /></button>
            <div className="w-px h-4 bg-white/10 self-center mx-1"></div>
            <button 
              type="button" 
              onClick={() => fileInputRef.current?.click()} 
              disabled={isUploading}
              className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors disabled:opacity-50" 
              title="Загрузить картинку"
            >
              {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImageUpload} 
              accept="image/*" 
              className="hidden" 
            />
        </div>
        <textarea
            ref={textareaRef}
            value={value}
            onChange={onChange}
            className={`w-full bg-black/20 border border-white/10 rounded-b-xl rounded-tr-xl p-4 text-white focus:border-primary outline-none transition-all resize-none text-sm ${className}`}
            onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey && onSubmit) {
                    onSubmit();
                }
            }}
            {...props}
        />
    </div>
  );
};
