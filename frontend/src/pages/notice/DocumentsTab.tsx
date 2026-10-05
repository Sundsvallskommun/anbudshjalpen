import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useSearchParams } from "react-router";
import { documentFileUrl } from "../../api/queries";
import type { NoticeDetail, UserView } from "../../api/types";
import { PageViewer } from "../../components/citations/PageViewer";
import { DocumentUpload } from "../../components/DocumentUpload";
import { Row, RowList } from "../../components/RowList";
import { FictitiousToken } from "../../components/tokens";
import { plural } from "../../lib/format";
import { primaryDocumentId } from "./noticeData";

/**
 * The documents and a page viewer. Which document, page and quote are shown lives in the address
 * (dokument, sida, citat), so a citation elsewhere can link straight to the marked quote.
 */
export function DocumentsTab({ notice, user }: { notice: NoticeDetail; user: UserView | null }) {
  const [params, setParams] = useSearchParams();
  const requested = params.get("dokument");
  const documentId = notice.documents.some((document) => document.id === requested)
    ? requested
    : primaryDocumentId(notice);
  const document = notice.documents.find((candidate) => candidate.id === documentId);
  const page = Math.max(1, Number.parseInt(params.get("sida") ?? "1", 10) || 1);
  const quote = params.get("citat");

  const show = (changes: Record<string, string | null>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );

  return (
    <VStack gap={6}>
      <Heading level={2}>Underlag</Heading>
      {notice.documents.length === 0 ? (
        <EmptyState
          headingLevel={3}
          title="Inget underlag ännu"
          description={
            notice.documents_url
              ? "Underlaget finns hos e-Avrop. Länken finns överst på sidan."
              : "Underlaget har inte publicerats eller laddats upp ännu."
          }
        />
      ) : (
        <RowList label="Dokument">
          {notice.documents.map((item) => (
            <Row key={item.id}>
              <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
                <VStack gap={1}>
                  <Text weight="semibold">{item.filename}</Text>
                  <HStack gap={2} vAlign="center" wrap="wrap">
                    <Text color="secondary">{plural(item.page_count, "sida", "sidor")}</Text>
                    {item.is_fictitious && <FictitiousToken />}
                  </HStack>
                </VStack>
                <HStack gap={3} vAlign="center" wrap="wrap">
                  {item.id !== documentId && (
                    <Button
                      label={`Visa ${item.filename}`}
                      size="sm"
                      onClick={() => show({ dokument: item.id, sida: "1", citat: null })}
                    >
                      Visa
                    </Button>
                  )}
                  <Link as="a" href={documentFileUrl(item.id)} download isStandalone>
                    Ladda ned originalet
                  </Link>
                </HStack>
              </HStack>
            </Row>
          ))}
        </RowList>
      )}
      {document && (
        <VStack gap={3}>
          <Heading level={3}>{document.filename}</Heading>
          <PageViewer
            noticeId={notice.id}
            documentId={document.id}
            page={Math.min(page, Math.max(1, document.page_count))}
            pageCount={document.page_count}
            onPageChange={(next) => show({ dokument: document.id, sida: String(next) })}
            quote={quote}
          />
        </VStack>
      )}
      {user?.role === "inkopare" && (
        <VStack gap={3}>
          <Heading level={3}>Ladda upp underlag</Heading>
          <DocumentUpload noticeId={notice.id} />
        </VStack>
      )}
    </VStack>
  );
}
