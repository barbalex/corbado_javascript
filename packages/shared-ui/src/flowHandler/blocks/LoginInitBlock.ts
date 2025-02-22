import type { CorbadoApp, GeneralBlockLoginInit, ProcessCommon } from '@corbado/web-core';
import { AuthType, PasskeyChallengeCancelledError, SocialDataStatusEnum } from '@corbado/web-core';
import type { SocialProviderType } from '@corbado/web-core/dist/api/v2';

import { BlockTypes, ScreenNames } from '../constants';
import type { ErrorTranslator } from '../errorTranslator';
import type { ProcessHandler } from '../processHandler';
import type { BlockDataLoginInit } from '../types';
import { Block } from './Block';

export class LoginInitBlock extends Block<BlockDataLoginInit> {
  readonly data: BlockDataLoginInit;
  readonly type = BlockTypes.LoginInit;
  readonly authType = AuthType.Login;
  readonly initialScreen = ScreenNames.LoginInit;
  #conditionalUIStarted = false;

  constructor(
    app: CorbadoApp,
    flowHandler: ProcessHandler,
    common: ProcessCommon,
    errorTranslator: ErrorTranslator,
    data: GeneralBlockLoginInit,
  ) {
    super(app, flowHandler, common, errorTranslator);

    const loginIdentifierError = errorTranslator.translate(data.fieldError);
    const lastIdentifierError = app.authProcessService.getLastIdentifier();

    this.data = {
      loginIdentifier: data.identifierValue ?? '',
      loginIdentifierError: loginIdentifierError ?? '',
      lastIdentifier: lastIdentifierError,
      isPhoneFocused: data.isPhone,
      emailEnabled: data.isEmailAvailable,
      usernameEnabled: data.isUsernameAvailable,
      phoneEnabled: data.isPhoneAvailable,
      conditionalUIChallenge: data.conditionalUIChallenge,
      socialData: {
        providers:
          data.socialData?.providers?.map(provider => {
            return { name: provider };
          }) || [],
        oAuthUrl: data.socialData?.oauthUrl,
        started: data.socialData?.status === SocialDataStatusEnum.Started || false,
        finished: data.socialData?.status === SocialDataStatusEnum.Finished || false,
      },
    };

    // errors in social logins should not be displayed in the login form (like we do for identifiers) but should appear on top of the screen
    if (data.error) {
      this.setError(data.error);
    }
  }

  async start(loginIdentifier: string, isPhone: boolean) {
    const b = await this.app.authProcessService.initLogin(loginIdentifier, isPhone);
    this.updateProcess(b);
  }

  switchToSignup() {
    const newPrimary = this.alternatives[0];
    const newAlternatives = [this];
    this.updateProcessFrontend(newPrimary, newAlternatives);
  }

  isSignupEnabled() {
    return this.alternatives.filter(b => b.type === BlockTypes.SignupInit).length > 0;
  }

  async continueWithConditionalUI() {
    if (!this.data.conditionalUIChallenge) {
      return;
    }

    if (this.#conditionalUIStarted) {
      console.log('Conditional UI already started');
      return;
    }

    this.#conditionalUIStarted = true;
    const b = await this.app.authProcessService.loginWithPasskeyChallenge(this.data.conditionalUIChallenge);
    if (b.err && (b.val instanceof PasskeyChallengeCancelledError || b.val.ignore)) {
      // we ignore this type of error
      return;
    }
    this.updateProcess(b);
  }

  async startSocialVerify(providerType: SocialProviderType) {
    const redirectUrl = window.location.origin + window.location.pathname;
    const res = await this.app.authProcessService.startSocialVerification(providerType, redirectUrl, AuthType.Login);
    if (!res) {
      return;
    }

    this.updateProcess(res);
  }

  async finishSocialVerify(abortController: AbortController) {
    const res = await this.app.authProcessService.finishSocialVerification(abortController);
    this.updateProcess(res);
  }

  discardOfferedLastIdentifier() {
    this.app.authProcessService.dropLastIdentifier(undefined);
  }
}
