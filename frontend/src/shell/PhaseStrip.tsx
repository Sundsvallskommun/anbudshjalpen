import { Banner } from "@astryxdesign/core/Banner";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { useIsPhone } from "../lib/usePhone";
import { useOpenAboutDemo } from "./AboutDemo";

export const STRIP_TEXT = "Påhittade företag och upphandlingar är märkta Fiktiv. AI kan ha fel – kontrollera alltid mot underlaget.";
export const STRIP_TEXT_PHONE = "Fiktiva uppgifter · AI kan ha fel";

/**
 * The demo strip (decision 0007): one line above the top bar on every page, never dismissible, on the neutral surface
 * with a yellow "Demo" token (the theme's section banner). Its details are one press away in "Om demon och AI". At
 * most 36 px high on a desktop and 52 px on a phone.
 */
export function PhaseStrip() {
  const isPhone = useIsPhone();
  const openAbout = useOpenAboutDemo();
  return (
    <Banner
      status="info"
      container="section"
      collapsible={false}
      icon={<Token label="Demo" color="yellow" size="sm" />}
      title={
        <Text type="supporting">
          {/* The token is drawn in the banner's hidden icon slot; screen readers hear its word here. */}
          <VisuallyHidden>Demo:</VisuallyHidden> {isPhone ? STRIP_TEXT_PHONE : STRIP_TEXT}{" "}
          <Link
            size="sm"
            hasUnderline
            aria-haspopup="dialog"
            label={isPhone ? "Mer om demon och AI" : undefined}
            onClick={() => openAbout?.()}
          >
            {isPhone ? "Mer" : "Om demon och AI"}
          </Link>
        </Text>
      }
    />
  );
}
