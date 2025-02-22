import type { PhoneVerifyBlock } from '@corbado/shared-ui';
import type { FC, FormEvent } from 'react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PrimaryButton } from '../../../components/ui/buttons/PrimaryButton';
import { SecondaryButton } from '../../../components/ui/buttons/SecondaryButton';
import { PhoneInputField } from '../../../components/ui/input/PhoneInputField';
import { Header } from '../../../components/ui/typography/Header';

export interface EditPhoneProps {
  block: PhoneVerifyBlock;
}

export const EditPhone: FC<EditPhoneProps> = ({ block }) => {
  const { t } = useTranslation('translation', { keyPrefix: `${block.authType}.phone-verify.edit-phone` });
  const [phone, setPhone] = useState<string>(block.data.phone);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [loading, setLoading] = useState<boolean>(false);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    phoneInputRef.current?.focus();
  }, []);

  const headerText = useMemo(() => t('header'), [t]);
  const primaryButtonText = useMemo(() => t('button_submit'), [t]);
  const secondaryButtonText = useMemo(() => t('button_cancel'), [t]);

  const handleConfirm = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setLoading(true);

      const error = await block.updatePhone(phone);

      if (error) {
        setErrorMessage(error);
        setLoading(false);
        return;
      }
    },
    [block, phone],
  );

  return (
    <form
      className='cb-edit-data-section'
      onSubmit={e => void handleConfirm(e)}
    >
      <Header
        size='md'
        className='cb-edit-data-section-header'
      >
        {headerText}
      </Header>
      <PhoneInputField
        initialPhoneNumber={phone}
        errorMessage={errorMessage}
        onChange={setPhone}
      />
      <PrimaryButton
        isLoading={loading}
        onClick={e => {
          const noChange = phone === block.data.phone;
          if (noChange) {
            block.showPhoneOtpScreen();
            return;
          }

          void handleConfirm(e);
        }}
      >
        {primaryButtonText}
      </PrimaryButton>
      <SecondaryButton
        className='cb-edit-data-section-back-button'
        onClick={() => block.showPhoneOtpScreen()}
      >
        {secondaryButtonText}
      </SecondaryButton>
    </form>
  );
};
