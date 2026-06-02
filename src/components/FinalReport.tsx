import { Fragment, type ReactNode } from "react";

// Minimal Markdown renderer for the LLM-generated memorandum. Handles the
// subset the prompt asks for — ## / ### headings, - / * bullet lists, **bold**
// inline — without pulling in a Markdown dependency.

function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) return <strong key={i}>{bold[1]}</strong>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export default function FinalReport({ markdown }: { markdown: string }) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let para: string[] = [];
  let key = 0;

  const flushList = () => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={key++}>
        {list.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>
    );
    list = [];
  };
  const flushPara = () => {
    if (para.length === 0) return;
    blocks.push(<p key={key++}>{renderInline(para.join(" "))}</p>);
    para = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h3 = line.match(/^###\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    const h1 = line.match(/^#\s+(.*)$/);
    const bullet = line.match(/^[-*]\s+(.*)$/);

    if (h3) {
      flushPara();
      flushList();
      blocks.push(<h4 key={key++}>{renderInline(h3[1])}</h4>);
    } else if (h2) {
      flushPara();
      flushList();
      blocks.push(<h3 key={key++}>{renderInline(h2[1])}</h3>);
    } else if (h1) {
      flushPara();
      flushList();
      blocks.push(<h2 key={key++}>{renderInline(h1[1])}</h2>);
    } else if (bullet) {
      flushPara();
      list.push(bullet[1]);
    } else if (line.trim() === "") {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();

  return <article className="final-report">{blocks}</article>;
}
