# 03 · Content Rating Guidance (IARC questionnaire)

Google Play uses the **IARC** questionnaire to generate regional ratings (ESRB, PEGI, USK, etc.). Answer it truthfully — misrepresenting content is a policy violation. Below are the recommended answers grounded in what TappyAI actually contains, plus the rating you should expect.

> Complete this in **Play Console → App content → Content ratings**. You select an app category, then answer yes/no questions. Re-take the questionnaire whenever content materially changes.

---

## Questionnaire category
Select: **App (Utility, Productivity, Communication, or Other)** — TappyAI is a utility/lifestyle assistant, not a game. (Even though it bundles light mini-games, the app as a whole is a utility with a games section; choosing the app/utility path is correct.)

---

## Recommended answers

| Topic | Answer | Why (grounded in the app) |
|---|---|---|
| Violence (realistic / cartoon / fantasy) | **No** | No violent content by design. |
| Blood / gore | **No** | None. |
| Sexual or suggestive content, nudity | **No** | None. |
| Profanity / crude humor | **No** (built-in) | The app ships no profanity. **But** AI-generated and user-generated text is open-ended — see "Generative AI" and "User interaction" below, which is the correct place to disclose this. |
| Controlled substances (drugs, alcohol, tobacco) | **No** | Not a theme. |
| **Gambling** (real or simulated) | **No** | Tarot/astrology/zodiac are **fortune-telling for entertainment**, not games of chance for stakes. The mini-games have no wagering. If any questionnaire asks specifically about "simulated gambling," answer **No** — there is no betting mechanic. |
| Purchases of real goods/services / in-app purchases | **No** (this build) | No billing library integrated; the app processes no payments. (Bookings collect a contact name/phone only.) |
| **Digital purchases / does the app contain IAP** | **No** | Same as above; revisit if you add billing. |
| **Users can interact / communicate** | **Yes** | The Reviews feature is a social feed: users post reviews and **comments**, and can **like/save** others' content. Users interact indirectly through shared content. |
| **User-generated content is shared with other users** | **Yes** | Reviews, review photos, and comments are visible to other users in-app. Music can be user-uploaded. Disclose UGC. |
| Users can share their location with others | **No** | The app has no location permission and no location-sharing feature. |
| Shares personal information with third parties | **Yes** (functional) | Query content is sent to AI/search processors to answer questions (see [02 Data Safety](02_data_safety.md)). |
| **Generative AI** — does the app use generative AI to produce content shown to users? | **Yes** | The core chat feature is generative-AI (Anthropic Claude). See the AI-specific sub-questions below. |
| Is AI-generated content moderated / can users report it? | **Yes, partial** | Users can **report** an AI reply (message feedback → report) and **report** review content; there is a copyright notice-and-takedown flow for uploaded music. Be honest that AI output is not human-pre-moderated. |
| Unrestricted internet access / web browsing | **No** | The app does not embed an open web browser; it opens external links via the system browser. |

---

## Expected rating

Because the app includes **unmoderated generative-AI output** and **user-generated content with social interaction** (but no violence, sex, gambling, or substances), the realistic outcome is:

- **ESRB:** Teen (likely) — driven by "Users Interact" + generative AI, not by mature content.
- **PEGI:** PEGI 12 (likely) — user interaction / UGC descriptor.
- **Play maturity:** **Teen / 13+** is the safe expectation.

> Do **not** target the app at children or opt into the **Families / Designed for Families** program. Unmoderated AI chat and open UGC make a children's audience inappropriate and would trigger stricter Families Policy requirements. Set the **target age group to 13+** in Play Console.

If your intended audience is strictly adults for the fortune-telling/entertainment framing, that's also defensible — but 13+ is the accurate floor based on content.

---

## Notes for consistency
- Keep the answers here consistent with [02 Data Safety](02_data_safety.md) (sharing with AI processors = Yes) and [04 AI Disclosure](04_ai_disclosure.md) (generative AI = Yes).
- If you later add real in-app purchases (billing), moderation changes, or remove the reviews/social feed, **re-take** the questionnaire.
