# Tappy Notification Identity — user guide (EN / VI)

Written in ordinary language. Nothing here names the services or infrastructure behind it — that
belongs in engineering docs, not in front of someone who just wants to know what the sound is.

**Status note for the team, not for users:** this describes the intended behaviour. Web is live on
the V2 branch; Android and iPhone are not finished yet. See the V2-03 report for exactly what works
today. Do not publish this to users until the platform table at the bottom says so.

---

| | English | Tiếng Việt |
|---|---|---|
| **1. Feature name** | Tappy Notification Sound | Âm thanh thông báo Tappy |
| **2. What it does** | Plays a short chime followed by the word "Tappy!" when a notification comes from Tappy, so you know who it is without looking. | Phát một tiếng chuông ngắn rồi nói "Tappy!" khi có thông báo từ Tappy, để bạn biết ai đang gọi mà không cần nhìn màn hình. |
| **3. Why it exists** | Phones make a lot of noise, and most of it sounds the same. When your phone is in your pocket or face-down on a table, a generic ding tells you nothing — you take the phone out to find it was not worth taking out. Tappy's sound is meant to be recognisable in one second, so you can decide whether to look. | Điện thoại kêu suốt ngày, và hầu hết đều nghe giống nhau. Khi máy đang trong túi hoặc úp trên bàn, một tiếng "ting" chung chung chẳng nói lên điều gì — bạn rút máy ra rồi mới biết là không cần rút. Âm của Tappy được làm để bạn nhận ra trong một giây, đủ để quyết định có nên nhìn hay không. |
| **4. How you experience it** | Nothing to set up. Allow notifications once, and Tappy's own sound plays when Tappy has something for you. Other notifications keep their normal sound. | Không cần cài đặt gì. Chỉ cần cho phép thông báo một lần, và âm riêng của Tappy sẽ vang lên khi Tappy có việc cho bạn. Các thông báo khác vẫn giữ âm bình thường. |
| **5. What Tappy does** | Plays the chime, says its own name, and stops. That is the whole sound. | Phát tiếng chuông, nói tên mình, rồi dừng. Chỉ có vậy. |
| **6. Result** | You recognise a Tappy notification by ear. The message itself stays on your screen to read when you want. | Bạn nhận ra thông báo của Tappy bằng tai. Nội dung vẫn nằm trên màn hình để đọc khi nào bạn muốn. |
| **7. Limitations** | Needs notification permission, and your phone must not be on silent. Not every notification uses it — only the ones Tappy considers worth recognising, otherwise the sound would stop meaning anything. | Cần quyền thông báo, và máy không để chế độ im lặng. Không phải thông báo nào cũng dùng âm này — chỉ những thông báo Tappy thấy đáng để bạn nhận ra, nếu không thì âm đó sẽ mất hết ý nghĩa. |
| **8. Example** | Your phone is in your bag. You hear the chime and "Tappy!" and know a price you were watching has dropped — worth stopping for. A moment later a different ding is just an app update, and you keep walking. | Điện thoại đang trong túi xách. Bạn nghe tiếng chuông và "Tappy!" là biết món hàng mình theo dõi đã giảm giá — đáng dừng lại. Lát sau một tiếng "ting" khác chỉ là cập nhật ứng dụng, và bạn đi tiếp. |

---

## The part people ask about first

> **Tappy does not read your notification content aloud.**
>
> **Tappy không đọc nội dung thông báo của bạn thành tiếng.**

The sound is always the same two things: a chime, then the word "Tappy". It never says who messaged
you, what the deal is, or anything else in the notification. If your phone is on a desk in a shared
office and a notification arrives, the people around you hear a chime and a name — nothing about you.

> Âm thanh luôn chỉ gồm hai thứ: tiếng chuông, rồi chữ "Tappy". Nó không bao giờ đọc ai nhắn cho bạn,
> ưu đãi là gì, hay bất cứ nội dung nào trong thông báo. Nếu điện thoại đang để trên bàn ở văn phòng
> chung và có thông báo, người xung quanh chỉ nghe một tiếng chuông và một cái tên — không có gì về bạn.

This is not a setting you have to trust us about — it is how the feature is built. The sound is a
single recording made in advance. There is nothing in it that could change with the message.

---

## Notification permission

Tappy asks once. If you say no, nothing breaks — you simply will not get notifications until you
allow them in your phone's settings. Allowing notifications does not give Tappy your microphone.

> Tappy chỉ hỏi một lần. Nếu bạn từ chối, không có gì hỏng cả — chỉ là bạn sẽ không nhận thông báo cho
> tới khi bật lại trong cài đặt máy. Cho phép thông báo **không** đồng nghĩa với cho Tappy dùng micro.

## Turning the sound off

**Settings → Tappy notification sound** — *Cài đặt → Âm thanh thông báo Tappy*

Turn it off and **you still get every notification**. They arrive normally and stay on your screen;
they just do not announce themselves with Tappy's chime. This is for people who want the messages
but not the sound — during meetings, at night, or simply by preference.

> Tắt đi thì **bạn vẫn nhận đủ mọi thông báo**. Chúng vẫn đến bình thường và vẫn hiển thị trên màn
> hình, chỉ là không kêu bằng tiếng chuông của Tappy nữa. Dành cho người muốn nhận tin nhưng không
> muốn tiếng động — lúc họp, ban đêm, hoặc đơn giản là không thích.

To stop notifications entirely, use your phone's own notification settings for Tappy. That is a
different switch, and turning off the sound is not a quiet way of doing it.

> Muốn tắt hẳn thông báo thì dùng cài đặt thông báo của điện thoại cho Tappy. Đó là công tắc khác —
> tắt âm thanh không phải là cách tắt thông báo.

---

## Where it works today

| | Web | iPhone | Android |
|---|---|---|---|
| Notification arrives | ✅ | ✅ | ⏳ not yet |
| Tappy chime + "Tappy!" | ✅ while the site is open | ⏳ not yet | ⏳ not yet |
| Turn the sound off | ⏳ not yet | ⏳ not yet | ⏳ not yet |
| Content ever read aloud | **never** | **never** | **never** |

⏳ means it is being built. Nothing marked ⏳ should be described to users as working.
