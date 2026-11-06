import type { ReactNode } from "react";
import { parseRichText, type RichAlign, type RichInline } from "@/lib/rich-text";

type Props = {
  text: string | null | undefined;
  className?: string;
};

const MATH_SYMBOLS: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", Delta: "Δ", epsilon: "ε", varepsilon: "ε",
  theta: "θ", lambda: "λ", mu: "μ", pi: "π", rho: "ρ", sigma: "σ", phi: "φ", varphi: "φ",
  omega: "ω", Omega: "Ω", nabla: "∇", times: "×", cdot: "·", pm: "±", mp: "∓",
  le: "≤", leq: "≤", ge: "≥", geq: "≥", neq: "≠", approx: "≈", sim: "∼", propto: "∝",
  infty: "∞", rightarrow: "→", to: "→", leftarrow: "←", leftrightarrow: "↔", degree: "°", circ: "°",
  ohm: "Ω", partial: "∂", sum: "Σ", int: "∫", div: "÷",
};

const MATH_WORDS = new Set(["sin", "cos", "tan", "sen", "log", "ln", "lim", "min", "max"]);

export function RichText({ text, className = "" }: Props) {
  const blocks = parseRichText(text);
  if (blocks.length === 0) return null;

  return (
    <div className={className}>
      {blocks.map((block, index) => {
        if (block.type === "table") {
          return (
            <div key={index} className="my-3 max-w-full overflow-x-auto rounded-md" style={{ textAlign: toCssAlign(block.align) }}>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => {
                        const isHeader = block.headerRow && rowIndex === 0;
                        const Cell = isHeader ? "th" : "td";
                        return (
                          <Cell
                            key={cellIndex}
                            scope={isHeader ? "col" : undefined}
                            className={"min-w-20 border border-foreground/35 px-3 py-2 align-top " + (isHeader ? "font-semibold" : "")}
                            style={{
                              backgroundColor: cell.background ?? (isHeader ? "var(--color-muted)" : undefined),
                            }}
                          >
                            {renderInlines(cell.inlines, `${index}-${rowIndex}-${cellIndex}`)}
                          </Cell>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag
              key={index}
              className={`mb-2 ${block.ordered ? "list-decimal" : "list-disc"} pl-6 last:mb-0`}
              style={{
                textAlign: toCssAlign(block.align),
                listStyleType: block.listStyle === "upper-alpha" ? "upper-alpha" : undefined,
              }}
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInlines(item, `${index}-${itemIndex}`)}</li>
              ))}
            </ListTag>
          );
        }

        return (
          <p key={index} className="mb-2 last:mb-0" style={{ textAlign: toCssAlign(block.align) }}>
            {renderInlines(block.inlines, `${index}`)}
          </p>
        );
      })}
    </div>
  );
}

function toCssAlign(align: RichAlign) {
  if (align === "justify") return "justify";
  return align;
}

function renderInlines(inlines: RichInline[], prefix: string): ReactNode[] {
  return inlines.map((inline, index) => {
    if (inline.type === "break") return <br key={`${prefix}-br-${index}`} />;
    if (inline.type === "math") return <MathExpression key={`${prefix}-m-${index}`} latex={inline.latex} display={inline.display} />;

    const style = {
      fontWeight: inline.bold ? 700 : undefined,
      fontStyle: inline.italic ? "italic" : undefined,
      textDecoration: inline.underline ? "underline" : undefined,
      backgroundColor: inline.highlight ? "rgba(250, 204, 21, 0.35)" : undefined,
      borderRadius: inline.highlight ? 2 : undefined,
      paddingInline: inline.highlight ? 2 : undefined,
    } as const;
    const content = <span style={style}>{inline.text}</span>;
    if (inline.superscript) return <sup key={`${prefix}-sup-${index}`}>{content}</sup>;
    if (inline.subscript) return <sub key={`${prefix}-sub-${index}`}>{content}</sub>;
    return <span key={`${prefix}-t-${index}`}>{content}</span>;
  });
}

function MathExpression({ latex, display }: { latex: string; display: boolean }) {
  const content = renderLatexNodes(latex.trim(), "m");
  if (display) {
    return (
      <span className="my-2 flex max-w-full justify-center overflow-x-auto rounded-md bg-muted/40 px-2 py-1 font-serif text-base">
        <span className="inline-flex items-center gap-0.5 whitespace-nowrap">{content}</span>
      </span>
    );
  }
  return <span className="inline-flex items-center gap-0.5 whitespace-nowrap align-middle font-serif">{content}</span>;
}

function renderLatexNodes(input: string, prefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let text = "";
  const pushText = () => {
    if (text) {
      nodes.push(<span key={`${prefix}-t-${nodes.length}`}>{text}</span>);
      text = "";
    }
  };

  for (let i = 0; i < input.length;) {
    const char = input[i];

    if (char === "\\") {
      if (input[i + 1] === "\\") {
        text += " ";
        i += 2;
        continue;
      }

      const commandMatch = input.slice(i + 1).match(/^[A-Za-z]+/);
      const command = commandMatch?.[0] ?? input[i + 1] ?? "";
      const commandEnd = i + 1 + command.length;

      if (command === "frac" || command === "dfrac" || command === "tfrac") {
        const numerator = readLatexGroup(input, commandEnd);
        const denominator = numerator ? readLatexGroup(input, numerator.end) : null;
        if (numerator && denominator) {
          pushText();
          nodes.push(
            <span key={`${prefix}-f-${nodes.length}`} className="mx-0.5 inline-flex flex-col items-center align-middle text-[0.95em] leading-tight">
              <span className="border-b border-current px-0.5">{renderLatexNodes(numerator.value, `${prefix}-fn-${nodes.length}`)}</span>
              <span className="px-0.5">{renderLatexNodes(denominator.value, `${prefix}-fd-${nodes.length}`)}</span>
            </span>,
          );
          i = denominator.end;
          continue;
        }
      }

      if (command === "sqrt") {
        const radicand = readLatexGroup(input, commandEnd);
        if (radicand) {
          pushText();
          nodes.push(
            <span key={`${prefix}-sqrt-${nodes.length}`} className="inline-flex items-start align-middle">
              <span className="pr-0.5 text-[1.15em] leading-none">√</span>
              <span className="border-t border-current px-0.5">{renderLatexNodes(radicand.value, `${prefix}-sqrtc-${nodes.length}`)}</span>
            </span>,
          );
          i = radicand.end;
          continue;
        }
      }

      if (command === "text" || command === "mathrm") {
        const group = readLatexGroup(input, commandEnd);
        if (group) {
          pushText();
          nodes.push(<span key={`${prefix}-text-${nodes.length}`} className="font-sans">{group.value}</span>);
          i = group.end;
          continue;
        }
      }

      if (command === "vec") {
        const group = readLatexGroup(input, commandEnd);
        if (group) {
          pushText();
          nodes.push(
            <span key={`${prefix}-vec-${nodes.length}`} className="inline-flex flex-col items-center align-middle leading-none">
              <span className="text-[0.65em] leading-none">→</span>
              <span>{renderLatexNodes(group.value, `${prefix}-vecc-${nodes.length}`)}</span>
            </span>,
          );
          i = group.end;
          continue;
        }
      }

      if (command === "bar" || command === "overline") {
        const group = readLatexGroup(input, commandEnd);
        if (group) {
          pushText();
          nodes.push(<span key={`${prefix}-bar-${nodes.length}`} style={{ textDecoration: "overline" }}>{renderLatexNodes(group.value, `${prefix}-barc-${nodes.length}`)}</span>);
          i = group.end;
          continue;
        }
      }

      if (command === "hat") {
        const group = readLatexGroup(input, commandEnd);
        if (group) {
          pushText();
          nodes.push(
            <span key={`${prefix}-hat-${nodes.length}`} className="inline-flex flex-col items-center align-middle leading-none">
              <span className="text-[0.75em] leading-none">^</span>
              <span>{renderLatexNodes(group.value, `${prefix}-hatc-${nodes.length}`)}</span>
            </span>,
          );
          i = group.end;
          continue;
        }
      }

      if (command === "left" || command === "right" || command === "begin" || command === "end") {
        i = commandEnd;
        const group = readLatexGroup(input, i);
        if (group) i = group.end;
        continue;
      }

      if (command === "," || command === ";" || command === "quad" || command === "qquad") {
        text += " ";
        i = commandEnd;
        continue;
      }

      const symbol = MATH_SYMBOLS[command];
      const word = MATH_WORDS.has(command) ? command : null;
      text += symbol ?? word ?? command;
      i = command ? commandEnd : i + 1;
      continue;
    }

    if ((char === "^" || char === "_") && i + 1 < input.length) {
      pushText();
      const script = readLatexScript(input, i + 1);
      const content = renderLatexNodes(script.value, `${prefix}-s-${nodes.length}`);
      nodes.push(char === "^"
        ? <sup key={`${prefix}-sup-${nodes.length}`} className="text-[0.7em] leading-none">{content}</sup>
        : <sub key={`${prefix}-sub-${nodes.length}`} className="text-[0.7em] leading-none">{content}</sub>);
      i = script.end;
      continue;
    }

    if (char === "{" || char === "}") {
      i++;
      continue;
    }

    if (char === "&") {
      text += " ";
      i++;
      continue;
    }

    text += char === "~" ? " " : char;
    i++;
  }

  pushText();
  return nodes.length > 0 ? nodes : [input];
}

function readLatexScript(input: string, start: number): { value: string; end: number } {
  const group = readLatexGroup(input, start);
  if (group) return group;
  if (input[start] === "\\") {
    const command = input.slice(start).match(/^\\[A-Za-z]+/);
    if (command) return { value: command[0], end: start + command[0].length };
  }
  return { value: input[start] ?? "", end: start + 1 };
}

function readLatexGroup(input: string, start: number): { value: string; end: number } | null {
  let i = start;
  while (input[i] === " ") i++;
  if (input[i] !== "{") return null;
  return readBalancedGroup(input, i);
}

function readBalancedGroup(input: string, start: number): { value: string; end: number } | null {
  let depth = 1;
  let i = start + 1;
  while (i < input.length && depth > 0) {
    if (input[i] === "{") depth++;
    if (input[i] === "}") depth--;
    i++;
  }
  if (depth !== 0) return null;
  return { value: input.slice(start + 1, i - 1), end: i };
}
