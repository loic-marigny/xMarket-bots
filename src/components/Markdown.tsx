import ReactMarkdown from "react-markdown";
import type { ComponentProps } from "react";

interface MarkdownProps extends ComponentProps<typeof ReactMarkdown> {
  className?: string;
}

/**
 * Shared Markdown renderer with opinionated typography for strategies/code notes.
 */
export const Markdown = ({ className, ...props }: MarkdownProps) => (
  <ReactMarkdown
    className={className}
    components={{
      h1: ({ node, ...rest }) => <h1 className="text-2xl font-bold mt-4 mb-2" {...rest} />,
      h2: ({ node, ...rest }) => <h2 className="text-xl font-semibold mt-4 mb-2" {...rest} />,
      h3: ({ node, ...rest }) => <h3 className="text-lg font-semibold mt-3 mb-1.5" {...rest} />,
      p: ({ node, ...rest }) => <p className="mb-3 leading-relaxed text-muted-foreground" {...rest} />,
      ul: ({ node, ordered, ...rest }) => {
        const props = { ...rest };
        delete (props as Record<string, unknown>).ordered;
        return <ul className="list-disc pl-5 space-y-1 text-muted-foreground mb-3" {...props} />;
      },
      ol: ({ node, ordered, ...rest }) => {
        const props = { ...rest };
        delete (props as Record<string, unknown>).ordered;
        return <ol className="list-decimal pl-5 space-y-1 text-muted-foreground mb-3" {...props} />;
      },
      li: ({ node, ordered, ...rest }) => {
        const props = { ...rest };
        delete (props as Record<string, unknown>).ordered;
        return <li {...props} />;
      },
      code: ({ inline, className: codeClass, children, ...rest }) =>
        inline ? (
          <code className={`px-1 py-0.5 rounded bg-muted text-sm ${codeClass ?? ""}`} {...rest}>
            {children}
          </code>
        ) : (
          <pre className="bg-muted p-3 rounded-md overflow-x-auto text-sm">
            <code className={codeClass} {...rest}>
              {children}
            </code>
          </pre>
        ),
    }}
    {...props}
  />
);
