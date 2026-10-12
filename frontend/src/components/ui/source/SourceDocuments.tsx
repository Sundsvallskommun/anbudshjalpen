import { createContext, use, type ReactNode } from "react";
import type { DocumentInfo } from "../../../api/types";

const SourceDocumentsContext = createContext<readonly DocumentInfo[]>([]);

/**
 * The documents a page's sources point into, so every source link on it can name the file ("Källa: 6.1
 * Upphandlingsföreskrifter.pdf, s. 5"). The notice page mounts it; pages without it, such as Start, show the page
 * alone.
 */
export function SourceDocumentsProvider({ documents, children }: { documents: readonly DocumentInfo[]; children: ReactNode }) {
  return <SourceDocumentsContext value={documents}>{children}</SourceDocumentsContext>;
}

/**
 * The name of the file a source is in: the one `documentId` names, else the page's primary (first) document, else
 * nothing, when no provider is mounted.
 */
export function useSourceDocumentName(documentId?: string | null): string | undefined {
  const documents = use(SourceDocumentsContext);
  if (documentId) return documents.find((document) => document.id === documentId)?.filename;
  return documents[0]?.filename;
}
