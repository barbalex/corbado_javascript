import { expect, test } from '../../../fixtures/UISignupTest';
import { OtpType, ScreenNames } from '../../../utils/constants';

test.describe('EnterOtpScreen unproductive user behavior', () => {
  test.skip('try to continue with incorrect OTP', async ({ signupFlow, page }) => {
    const [, email] = await signupFlow.navigateToEmailOtpScreen();

    await signupFlow.fillOTP(OtpType.Incorrect);
    await signupFlow.checkLandedOnScreen(ScreenNames.EmailOtp, email);
    await expect(page.getByText('The code is invalid or expired')).toBeVisible();
  });

  test.skip('modify email identifier', async ({ signupFlow, page }) => {
    let [, email] = await signupFlow.navigateToEmailOtpScreen();
    email = email ?? '';

    await page.getByAltText('edit-icon').click();
    await signupFlow.checkLandedOnScreen(ScreenNames.EmailEdit);
    await expect(page.getByRole('textbox')).toHaveValue(email);

    const newEmail = `${email.split('@')[0]}a@${email.split('@')[1]}`;
    await page.getByRole('textbox').click();
    await page.getByRole('textbox').fill(newEmail);
    await expect(page.getByRole('textbox')).toHaveValue(newEmail);

    await page.getByRole('button', { name: 'Resend code' }).click();
    await signupFlow.checkLandedOnScreen(ScreenNames.EmailOtp, newEmail);
  });

  test.skip('cancel modifying email identifier', async ({ signupFlow, page }) => {
    let [, email] = await signupFlow.navigateToEmailOtpScreen();
    email = email ?? '';

    await page.getByAltText('edit-icon').click();
    await signupFlow.checkLandedOnScreen(ScreenNames.EmailEdit);
    await expect(page.getByRole('textbox')).toHaveValue(email);

    const newEmail = `${email.split('@')[0]}a@${email.split('@')[1]}`;
    await page.getByRole('textbox').click();
    await page.getByRole('textbox').fill(newEmail);
    await expect(page.getByRole('textbox')).toHaveValue(newEmail);

    await page.getByText('Back').click();
    await signupFlow.checkLandedOnScreen(ScreenNames.EmailOtp, email);
  });

  // Skipped because loading external links take a long time
  // (navigationTimeout should be extended, but this doesn't seem worth it for this single test)
  test.skip('click external links', async ({ signupFlow, page }) => {
    await signupFlow.navigateToEmailOtpScreen();

    const newTabPromise1 = page.waitForEvent('popup');
    await page.getByText('Open in Gmail').click();
    const newTab1 = await newTabPromise1;
    await newTab1.waitForLoadState();
    expect(newTab1.url()).toContain('google');

    const newTabPromise2 = page.waitForEvent('popup');
    await page.getByText('Open in Yahoo').click();
    const newTab2 = await newTabPromise2;
    await newTab2.waitForLoadState();
    expect(newTab2.url()).toContain('yahoo');

    const newTabPromise3 = page.waitForEvent('popup');
    await page.getByText('Open in Outlook').click();
    const newTab3 = await newTabPromise3;
    await newTab3.waitForLoadState();
    expect(newTab3.url()).toContain('outlook');
  });
});
