import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { useOpenAboutDemo } from "./AboutDemo";
import styles from "./SiteFooter.module.css";

function Separator() {
  return (
    <Text type="supporting" aria-hidden="true">
      ·
    </Text>
  );
}

/**
 * The site's foot (direction.md, section 4 "Ramen"): "Anbudsklar · Sundsvalls kommun · Om demon och AI", below a line
 * and on the same content line as the top bar. It follows the main region, never inside it, so it is the page's one
 * top-level contentinfo landmark. "Tillgänglighetsredogörelse" joins it once that page exists.
 */
export function SiteFooter({ organization }: { organization?: string }) {
  const openAbout = useOpenAboutDemo();
  return (
    <HStack as="footer" gap={2} wrap="wrap" vAlign="center" className={styles.footer}>
      <Text type="supporting">Anbudsklar</Text>
      {organization && (
        <>
          <Separator />
          <Text type="supporting">{organization}</Text>
        </>
      )}
      <Separator />
      <Link size="sm" hasUnderline aria-haspopup="dialog" onClick={() => openAbout?.()}>
        Om demon och AI
      </Link>
    </HStack>
  );
}
