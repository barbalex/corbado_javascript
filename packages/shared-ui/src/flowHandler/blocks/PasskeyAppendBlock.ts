import type { BlockBody, CorbadoApp, GeneralBlockPasskeyAppend, GeneralBlockVerifyIdentifier } from '@corbado/web-core';
import { BlockType, VerificationMethod } from '@corbado/web-core';

import { BlockTypes, ScreenNames } from '../constants';
import type { ErrorTranslator } from '../errorTranslator';
import type { FlowHandler } from '../flowHandler';
import type { BlockDataPasskeyAppend } from '../types';
import { Block } from './Block';

export class PasskeyAppendBlock extends Block<BlockDataPasskeyAppend> {
  readonly data: BlockDataPasskeyAppend;
  readonly type = BlockTypes.PasskeyAppend;
  readonly initialScreen = ScreenNames.PasskeyAppend;

  constructor(
    app: CorbadoApp,
    flowHandler: FlowHandler,
    _: ErrorTranslator,
    data: GeneralBlockPasskeyAppend,
    alternatives: Array<BlockBody>,
  ) {
    super(app, flowHandler);

    const fallbacks = alternatives
      .filter(a => a.block === BlockType.PhoneVerify || a.block === BlockType.EmailVerify)
      .map(alternative => {
        switch (alternative.block) {
          case BlockType.EmailVerify: {
            const typed = alternative.data as GeneralBlockVerifyIdentifier;
            if (typed.verificationMethod === VerificationMethod.EmailOtp) {
              return { label: 'Send email verification code', action: () => this.initFallbackEmailOtp() };
            }

            return { label: 'Send email verification link', action: () => this.initFallbackEmailLink() };
          }
          case BlockType.PhoneVerify:
            return { label: 'Send phone verification code', action: () => this.initFallbackSmsOtp() };
          default:
            throw new Error('Invalid block type');
        }
      });

    // if there is a completed alternative, the passkey-append block can be skipped and the user can log in immediately
    const canBeSkipped = alternatives.some(a => a.block === BlockType.Completed);

    this.data = {
      availableFallbacks: fallbacks,
      userHandle: data.userHandle,
      canBeSkipped,
    };
  }

  showPasskeyBenefits() {
    this.updateScreen(ScreenNames.PasskeyBenefits);
  }

  async passkeyAppend() {
    const newBlock = await this.app.authProcessService.appendPasskey();
    this.flowHandler.updateBlock(newBlock);

    return;
  }

  async initFallbackEmailOtp() {
    const newBlock = await this.app.authProcessService.startEmailCodeVerification();
    this.flowHandler.updateBlock(newBlock);

    return;
  }

  initFallbackSmsOtp() {
    return;
  }

  async skipPasskeyAppend() {
    const newBlock = await this.app.authProcessService.finishAuthProcess();
    this.flowHandler.updateBlock(newBlock);

    return;
  }

  async initFallbackEmailLink() {
    const newBlock = await this.app.authProcessService.startEmailLinkVerification();
    this.flowHandler.updateBlock(newBlock);

    return;
  }
}
