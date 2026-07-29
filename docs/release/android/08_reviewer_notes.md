# 08 · Notes for Google Play Reviewers

Paste the relevant parts into **Play Console → App content → App access** (for login-gated content) and the release **review notes** field. Keep it factual and short; reviewers value clarity.

---

## About the app
TappyAI is a Vietnamese-language AI assistant for everyday life — finding places to eat, local spots, travel ideas, spa, shopping, plus utilities (currency, translate, photo scan) and a light reviews community. The primary language is **Vietnamese**; an in-app toggle switches to **English**.

## Sign-in is required to use most features
The app is account-based. To review the full experience, please use the test credentials below.

**Test account (fill in before submitting):**
```
Method:   Email OTP  (recommended for reviewers — no external OAuth needed)
Email:    <reviewer-test@example.com>
How to receive the code: <e.g. we will provide the current OTP on request, or use the Google test account below>

— or —

Google:   <reviewer test Google account email + password, if you enable Google for reviewers>
```
> Provide a working method. If OTP delivery to a shared inbox is impractical for reviewers, supply a dedicated Google test account instead. Do not ship without a usable review path, or the review may be rejected for "unable to access."

## How AI content and reporting work (Generative AI policy)
- The chat feature uses **generative AI** (Anthropic Claude) via our backend to answer questions; answers stream in and may include suggestion buttons/links.
- **Reporting:** users can report any AI reply from the message action bar (⋯ → Report). Reviews and comments can also be reported. User-uploaded music has a copyright notice-and-takedown flow.
- AI limitations are disclosed in-app under **Settings → Terms of Service → "AI-Provided Information"** and via "for entertainment only" notices on fortune features.

## Permissions
The app requests only `INTERNET` and `ACCESS_NETWORK_STATE`. Camera, gallery, and voice use the **system** camera/photo-picker/speech UIs, so no camera, microphone, storage, or location permissions are requested.

## Known behaviors a reviewer might notice
- **Facebook login:** the "Continue with Facebook" button is present but Facebook OAuth is currently **blocked at the Meta platform level (Business Verification pending)**, so it will not complete. Please use **Email OTP** or **Google** to sign in. *(If we hide this button for launch, disregard.)*
- **"Location" in personalization** is text the user optionally types in chat — the app does **not** access device GPS and requests no location permission.
- **No push notifications** on Android (the Notifications screen is a settings surface only).
- **No payments / IAP** are processed in this build.

## Content & audience
- Target audience: **13+**. Contains generative-AI output and a user-generated reviews feed with social interaction; no violence, sexual content, gambling, or controlled-substance themes.
- Fortune-telling features (Tarot, Vietnamese astrology, zodiac) are labeled **for entertainment only**.

## Data & privacy
- Privacy policy: `<public /privacy URL>`.
- Data is stored in our backend (Supabase); query content is sent to AI/search processors (Anthropic Claude, Google Search) to generate answers. We do not sell personal data. See our Data Safety form.
- Account/data deletion: `<in-app path or public deletion URL>`.

## Support
huypham.sm@gmail.com
