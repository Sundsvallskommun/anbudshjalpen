import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { ChatIcon } from "../ui/icons";
import styles from "./AskAiButton.module.css";
import { ASK_AI_TITLE } from "./AskAiPanel";
import { useAskAi } from "./AskAiProvider";

/**
 * "Fråga AI", the button that follows the reader at the end of the viewport on every page (decision 0014) and opens
 * or closes the panel. The one floating control in the app, so it is placed by a small style module.
 */
export function AskAiButton() {
  const ai = useAskAi();
  return (
    <HStack className={styles.button} data-ask-ai-button="">
      <Button
        label={ASK_AI_TITLE}
        variant="primary"
        icon={<Icon icon={ChatIcon} />}
        onClick={() => ai.toggle()}
        aria-haspopup="dialog"
        aria-expanded={ai.isOpen}
      />
    </HStack>
  );
}
