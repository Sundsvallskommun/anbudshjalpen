import { ChatToolCalls } from "@astryxdesign/core/Chat";
import type { ToolUse } from "../../api/types";

/** "Sök i LOU" or "Sök CPV-koder · 12 kandidater": one tool in words, for the print view. */
export function toolLabel(tool: ToolUse): string {
  return tool.detail ? `${tool.label} · ${tool.detail}` : tool.label;
}

/**
 * The tools an answer rested on, as the design system shows an assistant's tool calls (`ChatToolCalls`), under the
 * answer in the order they ran: our MCP tools that Eneo's assistant called ("Sök i LOU") and the app's own steps
 * ("Sök i underlaget", "Spara profilen"), each with its note ("12 kandidater"). One tool stands on its own line;
 * several fold into a summary with the last one showing, which opens to the whole list. The row says what was looked
 * up, so the reader can tell an answer from the law apart from one from memory; nothing when no tool ran. Every call
 * is complete by the time the answer is here: the app does not stream the steps yet.
 */
export function ToolsUsed({ tools }: { tools: readonly ToolUse[] }) {
  if (tools.length === 0) return null;
  return (
    <ChatToolCalls
      calls={tools.map((tool, index) => ({
        key: `${tool.name}-${index}`,
        name: tool.label,
        target: tool.detail ?? undefined,
        status: "complete",
      }))}
    />
  );
}
