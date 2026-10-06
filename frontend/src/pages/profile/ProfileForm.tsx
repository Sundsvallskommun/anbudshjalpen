import { Button } from "@astryxdesign/core/Button";
import { useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useRef, useState } from "react";
import { useUpdateProfile } from "../../api/queries";
import type { CompanyView, ProfileSaved } from "../../api/types";
import { ErrorNotice } from "../../components/states";
import { ActivitySection } from "./ActivitySection";
import { CompanyFacts } from "./CompanyFacts";
import {
  draftErrors,
  draftFromProfile,
  hasUnsavedChanges,
  LIMITS,
  savedMessage,
  toUpdate,
  type ProfileDraft,
} from "./profileDraft";
import { SaveBar } from "./SaveBar";

const TOO_SHORT_TO_SUGGEST = "Skriv några ord till om vad ni gör, så kan Anbudsklar föreslå koder.";

/** The browser asks before a reload or a closed tab throws away unsaved changes. */
function useUnsavedChangesWarning(isActive: boolean) {
  useEffect(() => {
    if (!isActive) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isActive]);
}

/**
 * "Profilen är sparad · 2 upphandlingar verkar passa er" with "Se träffarna" (direction.md, section 4). The way to
 * the matches stays until it is taken or the message is closed, like the app's other toasts with an action; when
 * nothing seems to fit there is no way to offer, and the message goes by itself.
 */
function useSavedToast() {
  const showToast = useToast();
  return (saved: ProfileSaved) => {
    const fitting = saved.fitting_notices;
    if (fitting === 0) {
      showToast({ body: savedMessage(fitting), uniqueID: "profil-sparad" });
      return;
    }
    let dismiss: () => void = () => {};
    dismiss = showToast({
      body: savedMessage(fitting),
      isAutoHide: false,
      uniqueID: "profil-sparad",
      endContent: <Button label="Se träffarna" size="sm" href="/start" onClick={() => dismiss()} />,
    });
  };
}

/**
 * The profile form (direction.md, section 4 "Företagsprofil"): what the company does and the facts requirements ask
 * about, each on its own card. Nothing is saved until "Spara profilen"; while anything is unsaved the save row stays
 * in view. The save assesses the matches anew, and the toast says how many seem to fit now.
 */
export function ProfileForm({ profile }: { profile: CompanyView }) {
  const [draft, setDraft] = useState<ProfileDraft>(() => draftFromProfile(profile));
  const [needsDescription, setNeedsDescription] = useState(false);
  const save = useUpdateProfile();
  const announceSaved = useSavedToast();
  const description = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const unsaved = hasUnsavedChanges(draft, profile);
  const errors = draftErrors(draft);
  useUnsavedChangesWarning(unsaved);

  const change = (changes: Partial<ProfileDraft>) => {
    setDraft((previous) => ({ ...previous, ...changes }));
    save.reset();
  };

  const changeDescription = (value: string) => {
    change({ description: value });
    if (value.trim().length >= LIMITS.suggestFrom) setNeedsDescription(false);
  };

  const askForDescription = () => {
    setNeedsDescription(true);
    description.current?.focus();
  };

  const submit = () => {
    if (Object.keys(errors).length > 0) {
      form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    save.mutate(toUpdate(draft), {
      onSuccess: (saved) => {
        setDraft(draftFromProfile(saved));
        announceSaved(saved);
      },
    });
  };

  const discard = () => {
    setDraft(draftFromProfile(profile));
    setNeedsDescription(false);
    save.reset();
  };

  return (
    <form ref={form} aria-label="Företagsprofil" onSubmit={(event) => event.preventDefault()}>
      <VStack gap={6}>
        <ActivitySection
          description={draft.description}
          onDescriptionChange={changeDescription}
          descriptionError={errors.description ?? (needsDescription ? TOO_SHORT_TO_SUGGEST : null)}
          descriptionRef={description}
          codes={draft.cpv}
          onCodesChange={(cpv) => change({ cpv })}
          onDescriptionNeeded={askForDescription}
        />
        <CompanyFacts draft={draft} errors={errors} onChange={change} />
        {save.isError && <ErrorNotice title="Profilen kunde inte sparas" error={save.error} />}
        {/* A direct child of the form's stack, so that it can stick anywhere along the form. */}
        <SaveBar hasUnsavedChanges={unsaved} isSaving={save.isPending} onSave={submit} onDiscard={discard} />
      </VStack>
    </form>
  );
}
