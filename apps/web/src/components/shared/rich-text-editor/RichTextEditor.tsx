'use client';

import { useCallback } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  Link as LinkIcon,
  Image as ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Heading1,
  Heading2,
  Heading3,
  Pilcrow,
  Unlink,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils/cn';

// ============================================================================
// Types
// ============================================================================
interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  editable?: boolean;
  minHeight?: string;
  onImageUpload?: (file: File) => Promise<string>;
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  tooltip: string;
  children: React.ReactNode;
}

// ============================================================================
// Editor Styles - Proper CSS for lists, headings, etc.
// ============================================================================
const editorStyles = `
  .tiptap-editor {
    min-height: var(--editor-min-height, 200px);
  }
  
  .tiptap-editor:focus {
    outline: none;
  }
  
  .tiptap-editor > * + * {
    margin-top: 0.75em;
  }
  
  /* Headings */
  .tiptap-editor h1 {
    font-size: 1.875rem;
    font-weight: 700;
    line-height: 1.2;
    margin-top: 1.5rem;
    margin-bottom: 0.5rem;
  }
  
  .tiptap-editor h2 {
    font-size: 1.5rem;
    font-weight: 600;
    line-height: 1.3;
    margin-top: 1.25rem;
    margin-bottom: 0.5rem;
  }
  
  .tiptap-editor h3 {
    font-size: 1.25rem;
    font-weight: 600;
    line-height: 1.4;
    margin-top: 1rem;
    margin-bottom: 0.5rem;
  }
  
  /* Paragraphs */
  .tiptap-editor p {
    margin-bottom: 0.5rem;
    line-height: 1.6;
  }
  
  /* Lists - Important: restore list styles */
  .tiptap-editor ul {
    list-style-type: disc;
    padding-left: 1.5rem;
    margin: 0.5rem 0;
  }
  
  .tiptap-editor ol {
    list-style-type: decimal;
    padding-left: 1.5rem;
    margin: 0.5rem 0;
  }
  
  .tiptap-editor li {
    margin: 0.25rem 0;
    line-height: 1.6;
  }
  
  .tiptap-editor li p {
    margin: 0;
  }
  
  .tiptap-editor ul ul,
  .tiptap-editor ol ol,
  .tiptap-editor ul ol,
  .tiptap-editor ol ul {
    margin: 0.25rem 0;
  }
  
  /* Nested list styles */
  .tiptap-editor ul ul {
    list-style-type: circle;
  }
  
  .tiptap-editor ul ul ul {
    list-style-type: square;
  }
  
  /* Blockquote */
  .tiptap-editor blockquote {
    border-left: 4px solid hsl(var(--primary));
    padding-left: 1rem;
    margin: 1rem 0;
    font-style: italic;
    color: hsl(var(--muted-foreground));
  }
  
  /* Strong & Emphasis */
  .tiptap-editor strong {
    font-weight: 600;
  }
  
  .tiptap-editor em {
    font-style: italic;
  }
  
  /* Links */
  .tiptap-editor a {
    color: hsl(var(--primary));
    text-decoration: underline;
    text-underline-offset: 4px;
    cursor: pointer;
  }
  
  .tiptap-editor a:hover {
    opacity: 0.8;
  }
  
  /* Images */
  .tiptap-editor img {
    max-width: 100%;
    height: auto;
    border-radius: 0.5rem;
    margin: 1rem 0;
  }
  
  /* Code */
  .tiptap-editor code {
    background-color: hsl(var(--muted));
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-size: 0.875em;
  }
  
  /* Horizontal Rule */
  .tiptap-editor hr {
    border: none;
    border-top: 1px solid hsl(var(--border));
    margin: 1.5rem 0;
  }
  
  /* Placeholder */
  .tiptap-editor p.is-editor-empty:first-child::before {
    content: attr(data-placeholder);
    float: left;
    color: hsl(var(--muted-foreground));
    pointer-events: none;
    height: 0;
  }
`;

// ============================================================================
// Toolbar Button Component
// ============================================================================
function ToolbarButton({ onClick, isActive, disabled, tooltip, children }: ToolbarButtonProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn('h-7 w-7 rounded-md', isActive && 'bg-primary/10 text-primary')}
            onClick={onClick}
            disabled={disabled}
          >
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ============================================================================
// Link Popover Component
// ============================================================================
function LinkPopover({ editor }: { editor: Editor }) {
  const setLink = useCallback(
    (url: string) => {
      if (url === '') {
        editor.chain().focus().extendMarkRange('link').unsetLink().run();
        return;
      }

      const formattedUrl =
        url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;

      editor.chain().focus().extendMarkRange('link').setLink({ href: formattedUrl }).run();
    },
    [editor]
  );

  const currentLink = editor.getAttributes('link').href || '';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'h-7 w-7 rounded-md',
            editor.isActive('link') && 'bg-primary/10 text-primary'
          )}
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="link-url">Link URL</Label>
            <Input
              id="link-url"
              placeholder="https://example.com"
              defaultValue={currentLink}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setLink((e.target as HTMLInputElement).value);
                }
              }}
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={(e) => {
                const input = (e.target as HTMLElement)
                  .closest('.space-y-3')
                  ?.querySelector('input') as HTMLInputElement;
                setLink(input?.value || '');
              }}
            >
              Apply
            </Button>
            {editor.isActive('link') && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => editor.chain().focus().unsetLink().run()}
              >
                <Unlink className="mr-1 h-3 w-3" />
                Remove
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// Image Popover Component
// ============================================================================
function ImagePopover({
  editor,
  onImageUpload,
}: {
  editor: Editor;
  onImageUpload?: (file: File) => Promise<string>;
}) {
  const addImage = useCallback(
    (url: string) => {
      if (url) {
        editor.chain().focus().setImage({ src: url }).run();
      }
    },
    [editor]
  );

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (onImageUpload) {
        try {
          const url = await onImageUpload(file);
          addImage(url);
        } catch (error) {
          console.error('Failed to upload image:', error);
        }
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          addImage(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    },
    [addImage, onImageUpload]
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-md">
          <ImageIcon className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Upload Image</Label>
            <Input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="cursor-pointer"
            />
          </div>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-popover text-muted-foreground px-2">Or</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="image-url">Image URL</Label>
            <div className="flex gap-2">
              <Input
                id="image-url"
                placeholder="https://example.com/image.jpg"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addImage((e.target as HTMLInputElement).value);
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                onClick={(e) => {
                  const input = (e.target as HTMLElement)
                    .closest('.space-y-2')
                    ?.querySelector('input') as HTMLInputElement;
                  addImage(input?.value || '');
                }}
              >
                Add
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================================
// Toolbar Component
// ============================================================================
function Toolbar({
  editor,
  onImageUpload,
}: {
  editor: Editor;
  onImageUpload?: (file: File) => Promise<string>;
}) {
  if (!editor) return null;

  return (
    <div className="bg-muted/40 flex flex-wrap items-center gap-0.5 border-b px-2 py-1.5">
      {/* Text Style */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        tooltip="Bold (Ctrl+B)"
      >
        <Bold className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        tooltip="Italic (Ctrl+I)"
      >
        <Italic className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive('underline')}
        tooltip="Underline (Ctrl+U)"
      >
        <UnderlineIcon className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive('strike')}
        tooltip="Strikethrough"
      >
        <Strikethrough className="h-3.5 w-3.5" />
      </ToolbarButton>

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/* Headings */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setParagraph().run()}
        isActive={editor.isActive('paragraph')}
        tooltip="Paragraph"
      >
        <Pilcrow className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        isActive={editor.isActive('heading', { level: 1 })}
        tooltip="Heading 1"
      >
        <Heading1 className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive('heading', { level: 2 })}
        tooltip="Heading 2"
      >
        <Heading2 className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive('heading', { level: 3 })}
        tooltip="Heading 3"
      >
        <Heading3 className="h-3.5 w-3.5" />
      </ToolbarButton>

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        tooltip="Bullet List"
      >
        <List className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
        tooltip="Numbered List"
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive('blockquote')}
        tooltip="Quote"
      >
        <Quote className="h-3.5 w-3.5" />
      </ToolbarButton>

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/* Alignment */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        isActive={editor.isActive({ textAlign: 'left' })}
        tooltip="Align Left"
      >
        <AlignLeft className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        isActive={editor.isActive({ textAlign: 'center' })}
        tooltip="Align Center"
      >
        <AlignCenter className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        isActive={editor.isActive({ textAlign: 'right' })}
        tooltip="Align Right"
      >
        <AlignRight className="h-3.5 w-3.5" />
      </ToolbarButton>

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/* Links & Images */}
      <LinkPopover editor={editor} />
      <ImagePopover editor={editor} onImageUpload={onImageUpload} />

      <div className="flex-1" />

      {/* Undo/Redo */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        tooltip="Undo (Ctrl+Z)"
      >
        <Undo className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        tooltip="Redo (Ctrl+Y)"
      >
        <Redo className="h-3.5 w-3.5" />
      </ToolbarButton>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================
export function RichTextEditor({
  content,
  onChange,
  placeholder = 'Start writing...',
  className,
  editable = true,
  minHeight = '200px',
  onImageUpload,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
      }),
      Link.configure({
        openOnClick: false,
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
    ],
    content,
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'tiptap-editor px-4 py-3 focus:outline-none',
        style: `--editor-min-height: ${minHeight}`,
      },
    },
  });

  return (
    <>
      <style>{editorStyles}</style>
      <div
        className={cn(
          'bg-background overflow-hidden rounded-lg border',
          !editable && 'opacity-60',
          className
        )}
      >
        {editable && editor && <Toolbar editor={editor} onImageUpload={onImageUpload} />}
        <EditorContent editor={editor} />
      </div>
    </>
  );
}

// ============================================================================
// Read-only Display Component
// ============================================================================
export function RichTextDisplay({ content, className }: { content: string; className?: string }) {
  return (
    <>
      <style>{editorStyles}</style>
      <div
        className={cn('tiptap-editor', className)}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </>
  );
}
