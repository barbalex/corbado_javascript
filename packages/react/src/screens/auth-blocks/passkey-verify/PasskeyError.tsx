import type { PasskeyVerifyBlock } from '@corbado/shared-ui';
import type { FC } from 'react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Divider, Header, PrimaryButton, SecondaryButton, Text, UserInfo } from '../../../components';
import { PasskeyErrorIcon } from '../../../components/ui/icons/PasskeyErrorIcon';
import { PersonIcon } from '../../../components/ui/icons/PersonIcon';

export interface PasskeyErrorProps {
  block: PasskeyVerifyBlock;
}

export const PasskeyError: FC<PasskeyErrorProps> = ({ block }) => {
  const { t } = useTranslation('translation', {
    keyPrefix: `login.passkey-verify.passkey-error`,
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [changingBlock, setChangingBlock] = useState<boolean>(false);
  const [userInfo, setUserInfo] = useState<string>(block.data.identifierValue);

  const headerText = useMemo(() => t('header'), [t]);
  const bodyTitleText = useMemo(() => t('body_title'), [t]);
  const bodyDescriptionText = useMemo(() => t('body_description'), [t]);
  const dividerText = useMemo(() => t('text_divider'), [t]);
  const tryAgainButtonText = useMemo(() => t('button_tryAgain'), [t]);
  const fallbackButtonText = useMemo(
    () => t(block.data.preferredFallbackOnError?.label ?? ''),
    [t, block.data.preferredFallbackOnError],
  );

  const primaryAction = useCallback(async () => {
    setLoading(true);

    if (block.data.preferredFallbackOnError) {
      setChangingBlock(true);
      await block.data.preferredFallbackOnError.action();
    } else {
      await block.passkeyLogin();
    }

    setLoading(false);
  }, [block]);

  useEffect(() => {
    return () => {
      block.cancelPasskeyOperation();
    };
  }, []);

  useEffect(() => {
    setUserInfo(block.getFormattedPhoneNumber());
  }, [block]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Enter') {
        void primaryAction();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [primaryAction]);

  async function userInfoChange() {
    setLoading(true);
    await block.confirmAbort();
    setLoading(false);
  }

  async function secondaryAction() {
    setLoading(true);
    await block.passkeyLogin();
    setLoading(false);
  }

  return (
    <div className='cb-pk-error-bloc'>
      <Header>{headerText}</Header>
      <div className='cb-pk-error-bloc-icon'>
        <PasskeyErrorIcon />
      </div>
      <div className='cb-pk-error-user-info-edit-section'>
        <Text
          level='2'
          fontWeight='bold'
          className='cb-pk-error-user-info-edit-section-title'
        >
          {bodyTitleText}
        </Text>
        <UserInfo
          userData={userInfo}
          leftIcon={<PersonIcon className='cb-user-info-section-left-icon' />}
          onRightIconClick={() => void userInfoChange()}
        ></UserInfo>
      </div>
      <Text
        level='2'
        fontFamilyVariant='secondary'
        className='cb-pk-error-bloc-description'
      >
        {bodyDescriptionText}
      </Text>
      <PrimaryButton
        onClick={() => void primaryAction()}
        isLoading={loading}
        disabled={changingBlock}
      >
        {block.data.preferredFallbackOnError ? fallbackButtonText : tryAgainButtonText}
      </PrimaryButton>
      {block.data.preferredFallbackOnError && (
        <>
          <Divider
            label={dividerText}
            className='cb-pk-error-bloc-divider'
          />
          <SecondaryButton
            onClick={() => void secondaryAction()}
            disabled={changingBlock}
          >
            {tryAgainButtonText}
          </SecondaryButton>
        </>
      )}
    </div>
  );
};
