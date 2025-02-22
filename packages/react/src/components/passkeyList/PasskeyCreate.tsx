import type { CorbadoError } from '@corbado/web-core';
import type { FC } from 'react';
import React, { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useCorbado } from '../../hooks/useCorbado';
import { PrimaryButton } from '../ui/buttons/PrimaryButton';
import { Dialog } from '../ui/Dialog';
import { AddIcon } from '../ui/icons/AddIcon';

export interface PasskeyCreateProps {
  fetchPasskeys: () => Promise<void>;
}

type TranslatedError = {
  dialogHeader: string;
  dialogBody: string;
  dialogConfirmText: string;
};

export const PasskeyCreate: FC<PasskeyCreateProps> = memo(({ fetchPasskeys }) => {
  const { t } = useTranslation('translation', { keyPrefix: 'passkey-list' });
  const { appendPasskey } = useCorbado();

  const [dialogError, setDialogError] = useState<CorbadoError | undefined>();
  const [loading, setLoading] = useState(false);

  const translatedTexts = useMemo(
    () => ({
      buttonText: t('button_createPasskey'),
    }),
    [t],
  );

  const translatedError: TranslatedError | null = useMemo(() => {
    if (!dialogError) {
      return null;
    }

    switch (dialogError.name) {
      case 'errors.passkeyAlreadyExists':
        return {
          dialogHeader: t('dialog_passkeyAlreadyExists.header'),
          dialogBody: t('dialog_passkeyAlreadyExists.body'),
          dialogConfirmText: t('dialog_passkeyAlreadyExists.button_confirm'),
        };
      case 'errors.passkeysNotSupported':
        return {
          dialogHeader: t('dialog_passkeysNotSupported.header'),
          dialogBody: t('dialog_passkeysNotSupported.body'),
          dialogConfirmText: t('dialog_passkeysNotSupported.button_confirm'),
        };
      default:
        return null;
    }
  }, [t, dialogError]);

  const showError = (error: CorbadoError | undefined) => {
    setDialogError(error);
  };

  const closeDialog = () => {
    setDialogError(undefined);
  };

  const createPasskey = async () => {
    setLoading(true);
    const result = await appendPasskey();

    if (result?.err) {
      showError(result.val);
    }

    if (result?.ok) {
      await fetchPasskeys();
    }

    setLoading(false);
  };

  return (
    <div>
      <PrimaryButton
        className='cb-passkey-list-primary-button'
        isLoading={loading}
        onClick={() => void createPasskey()}
      >
        <AddIcon /> {translatedTexts.buttonText}
      </PrimaryButton>
      <Dialog
        isOpen={translatedError !== null}
        header={translatedError?.dialogHeader ?? ''}
        body={translatedError?.dialogBody ?? ''}
        confirmText={translatedError?.dialogConfirmText ?? ''}
        onClose={closeDialog}
        onConfirm={closeDialog}
      />
    </div>
  );
});
