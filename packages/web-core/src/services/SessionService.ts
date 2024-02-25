import type { PassKeyList, SessionUser } from '@corbado/types';
import type { AxiosHeaders, AxiosInstance, AxiosRequestConfig, HeadersDefaults, RawAxiosRequestHeaders } from 'axios';
import axios, { type AxiosError } from 'axios';
import log from 'loglevel';
import { BehaviorSubject, type Subject } from 'rxjs';
import { Ok, Result } from 'ts-results';

import { Configuration } from '../api/v1';
import { UsersApi } from '../api/v2';
import { ShortSession } from '../models/session';
import {
  AuthState,
  CorbadoError,
  type GlobalError,
  NonRecoverableError,
  type PasskeyDeleteError,
  type PasskeyListError,
} from '../utils';
import { WebAuthnService } from './WebAuthnService';

const shortSessionKey = 'cbo_short_session';
const longSessionKey = 'cbo_long_session';

// controls how long before the shortSession expires we should refresh it
const shortSessionRefreshBeforeExpirationSeconds = 60;
// controls how often we check if we need to refresh the session
const shortSessionRefreshIntervalMs = 10_000;

const packageVersion = '0.0.0';

/**
 * The SessionService manages user sessions for the Corbado Application, handling shortSession and longSession.
 * It offers methods to set, delete, and retrieve these tokens and the username,
 * as well as a method to fetch the full user object from the Corbado API.
 *
 * The longSession should not be exposed from this service as it is only used for session refresh.
 */
export class SessionService {
  #usersApi: UsersApi = new UsersApi();
  #webAuthnService: WebAuthnService;

  readonly #setShortSessionCookie: boolean;
  readonly #frontendApiUrl: string;
  readonly #isPreviewMode: boolean;
  readonly #globalErrors: Subject<NonRecoverableError | undefined>;
  readonly #projectId: string;

  #shortSession: ShortSession | undefined;
  #longSession: string | undefined;
  #refreshIntervalId: NodeJS.Timeout | undefined;

  #userChanges: BehaviorSubject<SessionUser | undefined> = new BehaviorSubject<SessionUser | undefined>(undefined);
  #shortSessionChanges: BehaviorSubject<string | undefined> = new BehaviorSubject<string | undefined>(undefined);
  #authStateChanges: BehaviorSubject<AuthState> = new BehaviorSubject<AuthState>(AuthState.LoggedOut);

  constructor(
    globalErrors: GlobalError,
    projectId: string,
    setShortSessionCookie: boolean,
    isPreviewMode: boolean,
    frontendApiUrl?: string,
  ) {
    this.#globalErrors = globalErrors;
    this.#projectId = projectId;
    this.#webAuthnService = new WebAuthnService(globalErrors);
    this.#longSession = undefined;
    this.#setShortSessionCookie = setShortSessionCookie;
    this.#frontendApiUrl = frontendApiUrl || `https://${projectId}.frontendapi.corbado.io`;
    this.#isPreviewMode = isPreviewMode;
  }

  /**
   * Initializes the SessionService by registering a callback that is called when the shortSession changes.
   */
  async init() {
    this.#longSession = SessionService.#getLongSessionToken();
    this.#shortSession = SessionService.#getShortTermSessionToken();

    // if the session is valid, we emit it
    if (this.#shortSession && this.#shortSession.isValidForXMoreSeconds(0)) {
      log.debug('emit shortsession', this.#shortSession);
      this.#onShortSessionChange(this.#shortSession);
    } else {
      await this.#handleRefreshRequest();
    }

    this.#setApisV2(this.#longSession);

    // init scheduled session refresh
    this.#refreshIntervalId = setInterval(() => {
      void this.#handleRefreshRequest();
    }, shortSessionRefreshIntervalMs);

    document.addEventListener('visibilitychange', () => {
      this.#handleVisibilityChange();
    });
  }

  /**
   * Getter method for retrieving the short term session token.
   * @returns The short term session token or null if it's not set.
   */
  public get shortSession() {
    return this.#shortSession;
  }

  /**
   * Getter method for retrieving the username.
   * @returns The username or null if it's not set.
   */
  public getUser(): SessionUser | undefined {
    if (!this.#shortSession) {
      return;
    }

    const sessionParts = this.#shortSession.value.split('.');
    const sessionPayload = JSON.parse(atob(sessionParts[1]));

    return {
      email: sessionPayload.email,
      name: sessionPayload.name,
      orig: sessionPayload.orig,
      sub: sessionPayload.sub,
      exp: sessionPayload.exp,
    };
  }

  /**
   * Exposes changes to the user object
   */
  get userChanges(): BehaviorSubject<SessionUser | undefined> {
    return this.#userChanges;
  }

  /**
   * Exposes changes to the shortSession
   */
  get shortSessionChanges(): BehaviorSubject<string | undefined> {
    return this.#shortSessionChanges;
  }

  /**
   * Exposes changes to the auth state
   */
  get authStateChanges(): BehaviorSubject<AuthState> {
    return this.#authStateChanges;
  }

  abortOngoingPasskeyOperation() {
    this.#webAuthnService.abortOngoingOperation();
  }

  async appendPasskey(): Promise<Result<void, CorbadoError | undefined>> {
    const respStart = await this.#usersApi.currentUserPasskeyAppendStart({
      clientInfo: {},
    });

    const signedChallenge = await this.#webAuthnService.createPasskey(respStart.data.challenge);
    if (signedChallenge.err) {
      return signedChallenge;
    }

    await this.#usersApi.currentUserPasskeyAppendFinish({
      signedChallenge: signedChallenge.val,
      clientInfo: {},
    });

    return Ok(void 0);
  }

  async passkeyList(): Promise<Result<PassKeyList, PasskeyListError>> {
    return Result.wrapAsync(async () => {
      const resp = await this.#usersApi.currentUserPasskeyGet();
      return resp.data;
    });
  }

  async passkeyDelete(id: string): Promise<Result<void, PasskeyDeleteError>> {
    return Result.wrapAsync(async () => {
      await this.#usersApi.currentUserPasskeyDelete(id);
      return void 0;
    });
  }

  logout() {
    // TODO: should we call backend to destroy the session here?
    log.debug('logging out user');
    this.clear();

    this.#onShortSessionChange(undefined);
  }

  #onShortSessionChange(shortSession: ShortSession | undefined) {
    const user = this.getUser();

    if (user && shortSession) {
      this.#shortSessionChanges.next(shortSession.value);
      this.#updateAuthState(AuthState.LoggedIn);
      this.#updateUser(user);
    } else {
      console.log('user is logged out', user, shortSession);
      this.#shortSessionChanges.next(undefined);
      this.#updateAuthState(AuthState.LoggedOut);
      this.#updateUser(undefined);
    }
  }

  /** Method to set Session
   * It sets the short term session token, long term session token, and username for the Corbado Application.
   * @param shortSessionValue The short term session token to be set.
   * @param longSession The long term session token to be set.
   */
  setSession(shortSessionValue: string, longSession: string | undefined) {
    const shortSession = new ShortSession(shortSessionValue);
    console.log('set session', shortSession, longSession);

    this.#setShortTermSessionToken(shortSession);
    this.#setApisV2(longSession ?? '');

    this.#onShortSessionChange(shortSession);
    this.#setLongSessionToken(longSession);
  }

  #setApisV2(longSession: string): void {
    const config = new Configuration({
      apiKey: this.#projectId,
      basePath: this.#frontendApiUrl,
    });
    const axiosInstance = this.#createAxiosInstanceV2(longSession);

    this.#usersApi = new UsersApi(config, this.#frontendApiUrl, axiosInstance);
  }

  #createAxiosInstanceV2(longSession: string): AxiosInstance {
    const corbadoVersion = {
      name: 'web-core',
      sdkVersion: packageVersion,
    };

    const headers: RawAxiosRequestHeaders | AxiosHeaders | Partial<HeadersDefaults> = {
      'Content-Type': 'application/json',
      'X-Corbado-WC-Version': JSON.stringify(corbadoVersion), // Example default version
    };

    if (this.#isPreviewMode) {
      headers['X-Corbado-Mode'] = 'preview';
    }

    const out = axios.create({
      withCredentials: true,
      headers: { ...headers, Authorization: `Bearer ${longSession}` },
    });

    // We transform AxiosErrors into CorbadoErrors using axios interceptors.
    out.interceptors.response.use(
      response => {
        return response;
      },
      (error: AxiosError) => {
        const e = CorbadoError.fromAxiosError(error);
        log.warn('error', e);

        if (e instanceof NonRecoverableError) {
          this.#globalErrors.next(e);
          return Promise.reject();
        }

        return Promise.reject(e);
      },
    );

    return out;
  }

  /**
   * Method to delete Session.
   * It deletes the short term session token, long term session token, and username for the Corbado Application.
   */
  clear() {
    this.#deleteShortTermSessionToken();
    this.#deleteLongSessionToken();

    if (this.#refreshIntervalId) {
      clearInterval(this.#refreshIntervalId);
    }
  }

  /**
   * Gets the short term session token.
   */
  static #getShortTermSessionToken(): ShortSession | undefined {
    const localStorageValue = localStorage.getItem(shortSessionKey);
    if (localStorageValue) {
      return new ShortSession(localStorageValue);
    }

    // we currently only add this here to be backwards compatible with the legacy webcomponent
    // the idea is that a user can log into an application that uses the legacy webcomponent
    // the webcomponent will set the short term session token in a cookie and this package can then take it from there
    // as soon as the legacy webcomponent is removed, this can be removed as well
    const cookieValue = this.#getCookieValue(shortSessionKey);
    if (cookieValue) {
      return new ShortSession(cookieValue);
    }

    return undefined;
  }

  static #getCookieValue(name: string): string | undefined {
    const regex = new RegExp(`(^| )${name}=([^;]+)`);
    const match = document.cookie.match(regex);
    if (match) {
      return match[2];
    }

    return undefined;
  }

  /**
   * Deletes the long term session token cookie for dev environment in localStorage.
   */
  #deleteLongSessionToken(): void {
    localStorage.removeItem(longSessionKey);
    this.#longSession = '';
  }

  /**
   * Gets the long term session token.
   */
  static #getLongSessionToken() {
    return (localStorage.getItem(longSessionKey) as string) ?? '';
  }

  /**
   * Sets a short term session token.
   * @param value
   */
  #setShortTermSessionToken(value: ShortSession): void {
    localStorage.setItem(shortSessionKey, value.toString());
    this.#shortSession = value;

    if (this.#setShortSessionCookie) {
      document.cookie = `${shortSessionKey}=${value.toString()}; path=/;`;
    }
  }

  /**
   * Deletes the short term session token.
   */
  #deleteShortTermSessionToken(): void {
    localStorage.removeItem(shortSessionKey);
    this.#shortSession = undefined;

    if (this.#setShortSessionCookie) {
      document.cookie = `${shortSessionKey}=; path=/; expires=${new Date().toUTCString()}`;
    }
  }

  /**
   * Sets a long term session token for dev environment in localStorage.
   * For production, it sets a cookie.
   */
  #setLongSessionToken(longSessionToken: string | undefined): void {
    if (!longSessionToken) {
      return;
    }

    localStorage.setItem(longSessionKey, longSessionToken);
    this.#longSession = longSessionToken;
  }

  async #handleRefreshRequest() {
    // no shortSession => user is not logged in => nothing to refresh
    if (!this.#shortSession) {
      log.debug('session refresh: no refresh, user not logged in');

      return;
    }

    // refresh, token too old
    if (!this.#shortSession.isValidForXMoreSeconds(shortSessionRefreshBeforeExpirationSeconds)) {
      await this.#refresh();
    }

    // nothing to do for now
    log.debug('no refresh, no refresh, token still valid');
    return;
  }

  async #refresh() {
    log.debug('session refresh: starting refresh');

    try {
      const options: AxiosRequestConfig = {
        headers: {
          Authorization: `Bearer ${this.#longSession}`,
        },
      };
      const response = await this.#usersApi.currentUserSessionRefresh(options);
      if (response.status !== 200) {
        log.warn(`refresh error, status code: ${response.status}`);
        return;
      }

      if (!response.data.shortSession) {
        log.warn('refresh error, missing short session');
        return;
      }

      this.setSession(response.data.shortSession, undefined);
    } catch (e) {
      // if it's a network error, we should do a retry
      // for all other errors, we should log out the user
      log.warn(e);
      this.logout();
    }
  }

  #handleVisibilityChange() {
    if (document.hidden) {
      log.debug('session refresh: no refresh, page is hidden');

      return;
    }

    try {
      void this.#handleRefreshRequest();
    } catch (e) {
      log.error(e);
    }
  }

  #updateUser = (user: SessionUser | undefined) => {
    const currentUser = this.#userChanges.value;

    if (currentUser === user) {
      return;
    }

    if (
      currentUser?.email === user?.email &&
      currentUser?.name === user?.name &&
      currentUser?.orig === user?.orig &&
      currentUser?.sub === user?.sub
    ) {
      return;
    }

    this.#userChanges.next(user);
  };

  #updateAuthState = (authState: AuthState) => {
    if (this.#authStateChanges.value === authState) {
      return;
    }

    this.#authStateChanges.next(authState);
  };
}
