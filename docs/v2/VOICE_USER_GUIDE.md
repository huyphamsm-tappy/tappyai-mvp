# Tappy Voice — user-facing feature descriptions (EN / VI)

Product governance: a feature is not done until a user can understand how to use it. This document
is the user-facing half of V2-1; the engineering half lives in the code and its tests.

Written in ordinary language on purpose. No user-facing copy here mentions the provider, the API,
SSML, caching or any other implementation detail — those belong in engineering docs, not in front of
someone who just wants to talk to Tappy.

**Applies to:** Web, iOS, Android. Where a platform differs, it is stated rather than glossed over.

---

## A. Voice Input — nói thay vì gõ

| | English | Tiếng Việt |
|---|---|---|
| **1. Feature name** | Voice Input | Nhập bằng giọng nói |
| **2. What it does** | Turns what you say into text in the message box, so you can talk to Tappy instead of typing. | Chuyển lời bạn nói thành chữ trong ô tin nhắn, để bạn nói chuyện với Tappy thay vì gõ. |
| **3. Why it exists** | Typing is slow on a phone, and slower with Vietnamese tone marks. Speaking a question takes a few seconds; typing the same thing takes a lot longer — especially when your hands are busy, you are walking, or you are cooking. | Gõ trên điện thoại vốn đã chậm, gõ tiếng Việt có dấu còn chậm hơn. Nói một câu hỏi chỉ mất vài giây, gõ đúng câu đó thì lâu hơn nhiều — nhất là khi bạn đang bận tay, đang đi đường, hay đang nấu ăn. |
| **4. How to use it** | Tap the microphone, speak normally, then stop. Your words appear in the box as you talk, and the message sends shortly after you finish. Tap the status line before it sends if you want to edit first. | Chạm vào biểu tượng micro, nói bình thường, rồi dừng. Chữ hiện dần trong ô khi bạn nói, và tin nhắn sẽ gửi ngay sau khi bạn nói xong. Chạm vào dòng trạng thái trước khi gửi nếu bạn muốn sửa lại. |
| **5. What Tappy does** | Listens in the language you chose for the app, writes down what it hears, and lets you check it before anything is sent. | Nghe bằng ngôn ngữ bạn đã chọn cho ứng dụng, ghi lại những gì nghe được, và để bạn kiểm tra trước khi gửi đi. |
| **6. Expected result** | Your spoken question becomes an editable message, then a normal Tappy answer. | Câu hỏi bạn nói trở thành một tin nhắn có thể sửa, rồi Tappy trả lời như bình thường. |
| **7. Limitations** | Needs microphone permission and an internet connection. Listens in Vietnamese or English — the language you picked for the app. On the web it needs Chrome or Edge. Background noise reduces accuracy; you can always fix the text before sending. | Cần quyền micro và kết nối mạng. Chỉ nghe tiếng Việt hoặc tiếng Anh — theo ngôn ngữ bạn chọn cho ứng dụng. Trên web cần Chrome hoặc Edge. Chỗ ồn sẽ nghe kém chính xác hơn; bạn luôn sửa được chữ trước khi gửi. |
| **8. Example** | Tap the mic and say *"quán bún chả ngon gần Hoàn Kiếm"* — it appears as text and Tappy answers with suggestions. | Chạm micro và nói *"quán bún chả ngon gần Hoàn Kiếm"* — câu đó hiện thành chữ và Tappy gợi ý quán cho bạn. |

**Also available in Search and Translate**, with the same microphone button and the same behaviour.

---

## B. Read Aloud — nghe Tappy trả lời

| | English | Tiếng Việt |
|---|---|---|
| **1. Feature name** | Read Aloud | Đọc to |
| **2. What it does** | Reads Tappy's answer out loud. | Đọc to câu trả lời của Tappy. |
| **3. Why it exists** | Some answers are long, and some moments are not for reading — driving, cooking, walking, or resting your eyes. Listening also helps when the text is in a language you understand better by ear. | Có những câu trả lời khá dài, và có những lúc không tiện đọc — đang lái xe, nấu ăn, đi đường, hay chỉ muốn nghỉ mắt. Nghe cũng dễ hơn khi nội dung ở ngôn ngữ bạn quen nghe hơn là đọc. |
| **4. How to use it** | Tap the speaker icon under any Tappy reply. Tap it again to stop. | Chạm biểu tượng loa dưới câu trả lời của Tappy. Chạm lần nữa để dừng. |
| **5. What Tappy does** | Reads the reply **in the language the reply is written in** — a Vietnamese answer is read in Vietnamese even if the app is set to English. | Đọc câu trả lời **bằng đúng ngôn ngữ của câu trả lời đó** — câu tiếng Việt sẽ được đọc bằng tiếng Việt, kể cả khi ứng dụng đang để tiếng Anh. |
| **6. Expected result** | You hear the answer read naturally, and the text stays on screen the whole time. | Bạn nghe câu trả lời được đọc tự nhiên, và chữ vẫn hiển thị suốt quá trình đó. |
| **7. Limitations** | Vietnamese and English only for now. If your device or Tappy has no voice for that language, Tappy tells you instead of reading it in the wrong language — the text is always still there to read. Needs a connection and sound turned on. | Hiện chỉ có tiếng Việt và tiếng Anh. Nếu thiết bị hoặc Tappy chưa có giọng cho ngôn ngữ đó, Tappy sẽ báo cho bạn chứ không đọc bằng ngôn ngữ khác — chữ thì vẫn luôn còn đó để đọc. Cần có mạng và bật âm lượng. |
| **8. Example** | Ask for a 3-day Đà Nẵng itinerary, tap the speaker, and listen while you pack. | Hỏi lịch trình Đà Nẵng 3 ngày, chạm loa, rồi vừa nghe vừa xếp đồ. |

> **Why the reply's language and not the app's:** if you set the app to English but ask something in
> Vietnamese, Tappy answers in Vietnamese — and reading that aloud with an English voice would be
> unintelligible. The voice follows the words, not the menu.

---

## C. Voice Translation — nói một thứ tiếng, nghe thứ tiếng khác

| | English | Tiếng Việt |
|---|---|---|
| **1. Feature name** | Voice Translation | Dịch bằng giọng nói |
| **2. What it does** | You speak, Tappy translates, and you can read **and** hear the translation. | Bạn nói, Tappy dịch, và bạn vừa đọc được vừa nghe được bản dịch. |
| **3. Why it exists** | When you are standing in front of someone who does not share your language, typing a sentence is slow and awkward. Speaking it is faster, and being able to play the translation out loud means you can simply hold up your phone. | Khi bạn đang đứng trước một người không nói cùng ngôn ngữ, gõ từng câu vừa chậm vừa bất tiện. Nói ra thì nhanh hơn, và phát được bản dịch thành tiếng nghĩa là bạn chỉ cần đưa điện thoại lên. |
| **4. How to use it** | Open Translate, tap the microphone, and say your sentence. Pick the language to translate into, then tap Translate. Tap the speaker to hear the result. | Mở Dịch, chạm micro và nói câu của bạn. Chọn ngôn ngữ cần dịch sang, rồi chạm Dịch. Chạm loa để nghe kết quả. |
| **5. What Tappy does** | Writes down what you said, translates it, shows the translation on screen, and reads it out when you ask. | Ghi lại câu bạn nói, dịch câu đó, hiện bản dịch lên màn hình, và đọc to khi bạn yêu cầu. |
| **6. Expected result** | Your spoken sentence becomes translated text you can show someone — and play out loud. | Câu bạn nói trở thành bản dịch bạn có thể đưa cho người khác xem — và phát thành tiếng. |
| **7. Limitations** | You can speak in Vietnamese or English. You can translate **into** many more languages than Tappy can speak aloud — if there is no voice for the language you chose, the translation is still shown, just not read. Long passages may take a moment. | Bạn nói được bằng tiếng Việt hoặc tiếng Anh. Bạn dịch **sang** được nhiều ngôn ngữ hơn số ngôn ngữ Tappy đọc được — nếu ngôn ngữ đó chưa có giọng đọc, bản dịch vẫn hiện ra, chỉ là không đọc thành tiếng. Đoạn dài có thể mất một chút thời gian. |
| **8. Example** | Say *"cho tôi xin hoá đơn"*, translate to English, and show or play *"Could I have the bill, please?"* | Nói *"cho tôi xin hoá đơn"*, dịch sang tiếng Anh, rồi đưa cho xem hoặc phát *"Could I have the bill, please?"* |

> **The translated text never disappears.** Audio is always in addition to what is on screen, never
> instead of it — you can hand someone the phone even when sound is off or unavailable.

---

## In-product guidance

These are the moments a user needs a sentence of help. Keys live in `src/lib/i18n/w2/voice.ts`
(EN + VI, parity-tested).

| Moment | Key | English | Tiếng Việt |
|---|---|---|---|
| Button hint / first use | `voice.micHint` | Tap to speak | Bấm để nói |
| Listening | `voice.listening` | Listening… | Đang nghe… |
| About to send | `voice.sendingSoon` | Sending shortly — tap to edit | Sắp gửi — bấm để sửa lại |
| Stop | `voice.stopListening` | Stop listening | Dừng nghe |
| Permission explanation | `voice.permissionExplain` | Tappy needs your microphone to hear you. Audio is only used to turn speech into text. | Tappy cần quyền micro để nghe bạn nói. Âm thanh chỉ dùng để chuyển thành chữ. |
| Permission refused | `voice.permissionDenied` | Microphone access is needed to speak. Allow it for this site and try again. | Cần cấp quyền micro để nói. Hãy bật quyền cho trang rồi thử lại nhé. |
| Heard nothing | `voice.noSpeech` | I didn't catch anything — tap the mic and say it again. | Mình chưa nghe thấy gì — bấm micro và nói lại nhé. |
| No microphone | `voice.audioCapture` | No microphone was found on this device. | Không tìm thấy micro trên thiết bị. |
| Could not start | `voice.startFailed` | Couldn't start the microphone. Reload the page and try again. | Không khởi động được micro. Tải lại trang rồi thử lại nhé. |
| Other failure | `voice.recognitionError` | Something went wrong hearing you. Please try again. | Có trục trặc khi nhận giọng nói, thử lại nhé. |
| Browser too old | `voice.unsupportedBrowser` | This browser does not support voice input yet. Try Chrome or Edge. | Trình duyệt chưa hỗ trợ nhập bằng giọng nói. Hãy dùng Chrome hoặc Edge. |
| Language not supported | `voice.languageUnsupported` | Voice is not supported for this language yet. | Chưa hỗ trợ giọng nói cho ngôn ngữ này. |
| No voice available | `voice.voiceUnavailable` | This device has no {language} voice. You can still read the text above. | Thiết bị chưa có giọng đọc cho {language}. Bạn vẫn đọc được nội dung bên trên. |
| Read aloud / stop | `voice.readAloud` / `voice.stopReading` | Read aloud / Stop reading | Đọc to / Dừng đọc |

**Recovery, in every case:** the text stays on screen. No voice failure ever costs a user their
question, their answer, or their translation.

---

## Platform notes

| | Web | iOS | Android |
|---|---|---|---|
| Voice input | ✅ chat, search, translate | ⏳ locale wiring pending | ✅ chat, translate |
| Read aloud | ✅ Tappy's own voice | ⏳ pending | ✅ device voice, correct language |
| Voice translation | ✅ speech → text → translation → visible text → audio | ⏳ pending | ⏳ pending |
| Browser requirement | Chrome or Edge | — | — |

**A difference worth knowing about, in plain terms:** on the web, Read Aloud uses *Tappy's own
voice* — the same one for everybody. On Android it currently uses the voice built into your phone,
so two people may hear Tappy slightly differently. What is the same on both is the **language**: a
Vietnamese reply is read in Vietnamese and an English reply in English, whichever language the app
itself is set to. If a reply is in a language Tappy cannot read yet, it stays quiet and leaves the
text on screen rather than reading it in the wrong voice.

> **Một khác biệt bạn nên biết:** trên web, Đọc to dùng *giọng riêng của Tappy* — ai cũng nghe
> giống nhau. Trên Android hiện dùng giọng có sẵn trong máy, nên mỗi người có thể nghe hơi khác.
> Điểm giống nhau là **ngôn ngữ**: câu trả lời tiếng Việt được đọc bằng tiếng Việt, câu tiếng Anh
> đọc bằng tiếng Anh, bất kể ứng dụng đang để ngôn ngữ nào. Nếu gặp ngôn ngữ Tappy chưa đọc được,
> Tappy im lặng và giữ nguyên chữ trên màn hình, chứ không đọc bằng giọng sai.

⏳ = implemented in the shared contract but not yet wired on that platform. Tracked in the V2-1
report; nothing here is claimed as working that has not been tested.
