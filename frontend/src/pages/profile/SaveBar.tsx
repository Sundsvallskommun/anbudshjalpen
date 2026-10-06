import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import styles from "./SaveBar.module.css";

export interface SaveBarProps {
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}

/**
 * "Spara profilen", the page's one primary button, with "Ångra ändringar" and a word on what is unsaved. It sticks to
 * the bottom of the window while anything is unsaved (SaveBar.module.css).
 */
export function SaveBar({ hasUnsavedChanges, isSaving, onSave, onDiscard }: SaveBarProps) {
  return (
    <HStack
      gap={3}
      hAlign="between"
      vAlign="center"
      wrap="wrap"
      className={styles.bar}
      data-unsaved={hasUnsavedChanges}
    >
      <HStack gap={2} vAlign="center">
        {hasUnsavedChanges && (
          <>
            <Icon icon="info" color="secondary" size="sm" />
            <Text>Du har ändringar som inte är sparade.</Text>
          </>
        )}
      </HStack>
      <HStack gap={2} wrap="wrap">
        {hasUnsavedChanges && <Button label="Ångra ändringar" variant="ghost" onClick={onDiscard} isDisabled={isSaving} />}
        <Button label="Spara profilen" variant="primary" isLoading={isSaving} onClick={onSave} />
      </HStack>
    </HStack>
  );
}
